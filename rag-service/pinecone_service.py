"""
Phase 32 — Pinecone Vector Store Integration
Privacy-Preserving Vector Storage with Strict User Isolation.

Pinecone Vector Schema:
{
    "id": imageId,
    "values": embedding,
    "metadata": {
        "userId": userId
    }
}

User Isolation Mechanism:
1. Namespace Partitioning: Every operation (upsert, query, delete) is scoped to namespace=str(userId).
2. Ownership Validation: Every upsert/query strictly binds and verifies metadata.userId == userId.
3. Privacy Boundary: ZERO file paths (relativePath, absolutePath, directory) or photos (binary, base64) are stored.
"""

import os
import logging
from typing import List, Dict, Any, Optional
import numpy as np

logger = logging.getLogger("pinecone_service")

# Try importing modern Pinecone SDK (v3+ or v2)
PINECONE_AVAILABLE = False
try:
    from pinecone import Pinecone, ServerlessSpec
    PINECONE_SDK_VERSION = "v3+"
    PINECONE_AVAILABLE = True
except ImportError:
    try:
        import pinecone
        PINECONE_SDK_VERSION = "v2"
        PINECONE_AVAILABLE = True
    except ImportError:
        PINECONE_SDK_VERSION = None
        PINECONE_AVAILABLE = False


class InMemoryVectorStore:
    """
    In-memory isolated vector store fallback when Pinecone credentials
    are not configured or during offline testing.
    Mirrors identical namespace partitioning, vector schemas, and ownership validation.
    """
    def __init__(self):
        # Structure: { namespace (userId): { imageId: { id, values, metadata: { userId } } } }
        self._stores: Dict[str, Dict[str, Dict[str, Any]]] = {}

    def upsert(self, namespace: str, vectors: List[Dict[str, Any]]) -> int:
        if namespace not in self._stores:
            self._stores[namespace] = {}
        for vec in vectors:
            self._stores[namespace][vec["id"]] = vec
        return len(vectors)

    def query(
        self,
        namespace: str,
        vector: List[float],
        top_k: int = 5,
        filter_metadata: Optional[Dict[str, Any]] = None
    ) -> List[Dict[str, Any]]:
        user_space = self._stores.get(namespace, {})
        if not user_space:
            return []

        q_vec = np.array(vector, dtype=np.float32)
        q_norm = np.linalg.norm(q_vec)
        if q_norm > 0:
            q_vec = q_vec / q_norm

        scored = []
        for item_id, item in user_space.items():
            # Ownership validation
            if filter_metadata:
                expected_user = filter_metadata.get("userId")
                if expected_user and item.get("metadata", {}).get("userId") != str(expected_user):
                    continue

            v = np.array(item["values"], dtype=np.float32)
            v_norm = np.linalg.norm(v)
            if v_norm > 0:
                v = v / v_norm
            similarity = float(np.dot(q_vec, v))
            scored.append({
                "id": item["id"],
                "score": similarity,
                "metadata": item["metadata"]
            })

        scored.sort(key=lambda x: x["score"], reverse=True)
        return scored[:top_k]

    def delete(self, namespace: str, ids: List[str]) -> int:
        user_space = self._stores.get(namespace, {})
        count = 0
        for item_id in ids:
            if item_id in user_space:
                del user_space[item_id]
                count += 1
        return count

    def count(self, namespace: Optional[str] = None) -> int:
        if namespace:
            return len(self._stores.get(namespace, {}))
        return sum(len(v) for v in self._stores.values())


class PineconeManager:
    """
    Manages Pinecone vector operations with strict user isolation
    and privacy preservation.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        index_name: Optional[str] = None
    ):
        raw_key = api_key or os.getenv("PINECONE_API_KEY")
        self.api_key = raw_key.strip() if raw_key else None
        self.index_name = (index_name or os.getenv("PINECONE_INDEX_NAME", "stash-photos")).strip()
        self.pinecone_client = None
        self.index = None
        self.in_memory_store = InMemoryVectorStore()
        self.is_connected = False
        self._init_pinecone()

    def _init_pinecone(self):
        if not PINECONE_AVAILABLE:
            logger.info("[PineconeManager] Pinecone SDK not installed. Running in-memory isolated vector store.")
            return

        if not self.api_key:
            logger.info("[PineconeManager] Notice: PINECONE_API_KEY not configured. Running in-memory isolated vector store.")
            return

        try:
            if PINECONE_SDK_VERSION == "v3+":
                self.pinecone_client = Pinecone(api_key=self.api_key)
                # Check if index exists or connect
                self.index = self.pinecone_client.Index(self.index_name)
                self.is_connected = True
                logger.info(f"[PineconeManager] Connected to Pinecone index: '{self.index_name}' (v3+ SDK)")
            elif PINECONE_SDK_VERSION == "v2":
                import pinecone
                env = os.getenv("PINECONE_ENVIRONMENT", "us-east-1")
                pinecone.init(api_key=self.api_key, environment=env)
                self.index = pinecone.Index(self.index_name)
                self.is_connected = True
                logger.info(f"[PineconeManager] Connected to Pinecone index: '{self.index_name}' (v2 SDK)")
        except Exception as e:
            logger.warning(f"[PineconeManager] Failed to connect to Pinecone index '{self.index_name}': {e}. Using in-memory fallback.")
            self.index = None
            self.is_connected = False

    def reload(self, api_key: Optional[str] = None, index_name: Optional[str] = None):
        """Allows dynamic reload of Pinecone connection."""
        if api_key:
            self.api_key = api_key.strip()
        if index_name:
            self.index_name = index_name.strip()
        self._init_pinecone()

    @staticmethod
    def _sanitize_record(user_id: str, item: Dict[str, Any]) -> Dict[str, Any]:
        """
        Phase 32 Privacy Enforcement:
        Strip all forbidden local paths, filenames, or photo binaries.
        Return ONLY:
        {
            "id": imageId,
            "values": embedding,
            "metadata": {
                "userId": userId
            }
        }
        """
        image_id = str(item.get("imageId") or item.get("id"))
        if not image_id:
            raise ValueError("Record missing required 'imageId'")

        embedding = item.get("embedding") or item.get("values")
        if not embedding or not isinstance(embedding, (list, tuple)):
            raise ValueError(f"Record '{image_id}' missing valid dense vector 'embedding'")

        clean_vector = [float(v) for v in embedding]

        # Strictly enforce metadata contains ONLY user scope
        sanitized_metadata = {
            "userId": str(user_id)
        }

        return {
            "id": image_id,
            "values": clean_vector,
            "metadata": sanitized_metadata
        }

    def upsert_vectors(self, user_id: str, items: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Upserts vector embeddings strictly into the user's namespace.
        Enforces user isolation and strict privacy boundary.
        """
        if not user_id:
            raise ValueError("user_id is required for user-isolated upsert")

        sanitized_records = []
        for item in items:
            try:
                record = self._sanitize_record(user_id, item)
                sanitized_records.append(record)
            except Exception as err:
                logger.warning(f"[PineconeManager] Skipping invalid item for user '{user_id}': {err}")

        if not sanitized_records:
            return {
                "success": False,
                "upsertedCount": 0,
                "namespace": str(user_id),
                "message": "No valid vectors to upsert"
            }

        namespace = str(user_id)

        # 1. Pinecone Cloud Upsert
        if self.is_connected and self.index:
            try:
                self.index.upsert(
                    vectors=sanitized_records,
                    namespace=namespace
                )
                logger.info(f"[PineconeManager] Successfully upserted {len(sanitized_records)} vector(s) to Pinecone namespace '{namespace}'")
            except Exception as e:
                logger.error(f"[PineconeManager] Cloud upsert failed: {e}. Syncing to fallback memory store.")
                self.in_memory_store.upsert(namespace=namespace, vectors=sanitized_records)
        else:
            # 2. In-Memory Fallback
            self.in_memory_store.upsert(namespace=namespace, vectors=sanitized_records)

        return {
            "success": True,
            "upsertedCount": len(sanitized_records),
            "namespace": namespace,
            "storage": "pinecone" if (self.is_connected and self.index) else "in-memory"
        }

    def query_vectors(
        self,
        user_id: str,
        vector: List[float],
        top_k: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Queries top-k nearest neighbor vectors strictly inside the user's namespace.
        Applies filter={"userId": str(user_id)} and validates ownership on every return.
        """
        if not user_id:
            raise ValueError("user_id is required for user-isolated query")

        namespace = str(user_id)
        clean_vector = [float(v) for v in vector]
        results = []

        if self.is_connected and self.index:
            try:
                res = self.index.query(
                    vector=clean_vector,
                    top_k=top_k,
                    namespace=namespace,
                    filter={"userId": str(user_id)},
                    include_metadata=True
                )
                matches = res.get("matches", []) if isinstance(res, dict) else getattr(res, "matches", [])
                for m in matches:
                    m_id = m.get("id") if isinstance(m, dict) else getattr(m, "id", None)
                    m_score = m.get("score") if isinstance(m, dict) else getattr(m, "score", 0.0)
                    m_meta = m.get("metadata", {}) if isinstance(m, dict) else getattr(m, "metadata", {})
                    
                    # Ownership validation: Reject any vector that does not match authenticated user
                    m_user = m_meta.get("userId") if isinstance(m_meta, dict) else getattr(m_meta, "userId", None)
                    if str(m_user) != str(user_id):
                        logger.warning(f"[PineconeManager] Security alert: Mismatched vector ownership rejected for id '{m_id}'")
                        continue

                    results.append({
                        "imageId": str(m_id),
                        "score": round(float(m_score), 4),
                        "userId": str(user_id)
                    })
                return results
            except Exception as e:
                logger.error(f"[PineconeManager] Cloud query failed: {e}. Falling back to in-memory store.")

        # In-memory query with ownership validation
        mem_matches = self.in_memory_store.query(
            namespace=namespace,
            vector=clean_vector,
            top_k=top_k,
            filter_metadata={"userId": str(user_id)}
        )
        for m in mem_matches:
            results.append({
                "imageId": str(m["id"]),
                "score": round(float(m["score"]), 4),
                "userId": str(user_id)
            })

        return results

    def delete_vectors(self, user_id: str, image_ids: List[str]) -> Dict[str, Any]:
        """
        Deletes vector embeddings strictly within the user's namespace.
        """
        if not user_id:
            raise ValueError("user_id is required for user-isolated delete")

        clean_ids = [str(i) for i in image_ids if i]
        if not clean_ids:
            return {"success": True, "deletedCount": 0, "namespace": str(user_id)}

        namespace = str(user_id)
        deleted_count = len(clean_ids)

        if self.is_connected and self.index:
            try:
                self.index.delete(ids=clean_ids, namespace=namespace)
                logger.info(f"[PineconeManager] Deleted {len(clean_ids)} vector(s) from namespace '{namespace}'")
            except Exception as e:
                logger.error(f"[PineconeManager] Cloud delete failed: {e}. Deleting from in-memory store.")
                deleted_count = self.in_memory_store.delete(namespace=namespace, ids=clean_ids)
        else:
            deleted_count = self.in_memory_store.delete(namespace=namespace, ids=clean_ids)

        return {
            "success": True,
            "deletedCount": deleted_count,
            "namespace": namespace,
            "storage": "pinecone" if (self.is_connected and self.index) else "in-memory"
        }

    def get_status(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Telemetry status of the Pinecone service."""
        status_info = {
            "connected": self.is_connected,
            "indexName": self.index_name,
            "sdkVersion": PINECONE_SDK_VERSION,
            "storageMode": "cloud-pinecone" if self.is_connected else "in-memory-isolated",
            "hasApiKey": bool(self.api_key),
            "isolation": "namespace + ownership validation",
            "storedFields": ["id (imageId)", "values (embedding)", "metadata.userId"]
        }
        if user_id:
            status_info["userNamespace"] = str(user_id)
            status_info["inMemoryUserVectorCount"] = self.in_memory_store.count(namespace=str(user_id))
        return status_info
