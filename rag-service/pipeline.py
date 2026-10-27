"""
Phase 31 — Text Embedding Pipeline
Constructs retrieval text from semantic captions and keywords, then transforms
the constructed text into dense vector embeddings.

PRIVACY BOUNDARY:
- Text embedding ONLY.
- Original image binaries/pixels never enter this pipeline.
"""

import os
import hashlib
from typing import List, Optional
import numpy as np

def construct_retrieval_text(caption: str, keywords: Optional[List[str]] = None) -> str:
    """
    Constructs unified retrieval text for embedding and search.

    Example:
        caption: "Three people standing on a sandy beach beside the ocean at sunset..."
        keywords: ["people", "beach", "ocean", "sunset", "waves"]
        Output:
            Three people standing on a sandy beach beside the ocean at sunset...
            Keywords: people, beach, ocean, sunset, waves
    """
    clean_caption = (caption or "").strip()
    if not keywords:
        return clean_caption

    # Deduplicate and trim keywords preserving order
    seen = set()
    clean_kws = []
    for k in keywords:
        if k and isinstance(k, str):
            trimmed = k.strip()
            if trimmed and trimmed.lower() not in seen:
                seen.add(trimmed.lower())
                clean_kws.append(trimmed)

    if not clean_kws:
        return clean_caption

    return f"{clean_caption}\nKeywords: {', '.join(clean_kws)}"


class TextEmbeddingPipeline:
    """
    Text embedding pipeline using Google Generative AI (text-embedding-004)
    with local deterministic fallback if the API key is not yet pasted.
    """

    def __init__(self, api_key: Optional[str] = None, model_name: str = "models/text-embedding-004"):
        raw_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self.api_key = raw_key.strip() if raw_key else None
        self.model_name = model_name
        self.embedder = None
        self._init_embedder()

    def _init_embedder(self):
        if self.api_key:
            try:
                from langchain_google_genai import GoogleGenerativeAIEmbeddings
                self.embedder = GoogleGenerativeAIEmbeddings(
                    model=self.model_name,
                    google_api_key=self.api_key
                )
                print(f"[TextEmbeddingPipeline] Initialized LangChain GoogleGenerativeAIEmbeddings ({self.model_name})")
            except Exception as e:
                print(f"[TextEmbeddingPipeline] LangChain embedder initialization warning: {e}. Fallback active.")
                self.embedder = None
        else:
            print("[TextEmbeddingPipeline] Notice: GEMINI_API_KEY not yet set. Fallback text vectorizer will be used.")

    def embed_text(self, text: str) -> List[float]:
        """
        Embeds a single retrieval text string into a vector.
        """
        if not text or not text.strip():
            return [0.0] * 768

        # 1. Try LangChain Google Embeddings
        if self.embedder:
            try:
                vector = self.embedder.embed_query(text)
                return vector
            except Exception as e:
                print(f"[TextEmbeddingPipeline] LangChain embedding failed: {e}. Using deterministic fallback.")

        # 2. Deterministic zero-crash text embedding fallback (768 dimensions)
        return self._deterministic_text_embedding(text)

    def embed_batch(self, texts: List[str]) -> List[List[float]]:
        """
        Batch embeds multiple retrieval text strings.
        """
        if not texts:
            return []

        if self.embedder:
            try:
                return self.embedder.embed_documents(texts)
            except Exception as e:
                print(f"[TextEmbeddingPipeline] Batch embedding error: {e}. Falling back.")

        return [self.embed_text(t) for t in texts]

    def _deterministic_text_embedding(self, text: str, dimensions: int = 768) -> List[float]:
        """
        Generates a normalized 768-dim float vector deterministically from text tokens.
        Ensures identical text produces identical vector cosine similarity offline.
        """
        tokens = text.lower().split()
        vec = np.zeros(dimensions, dtype=np.float32)

        for token in tokens:
            # Hash token into dimension buckets
            h = int(hashlib.sha256(token.encode('utf-8')).hexdigest(), 16)
            idx = h % dimensions
            sign = 1.0 if ((h >> 8) & 1) else -1.0
            vec[idx] += sign

        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec.tolist()
