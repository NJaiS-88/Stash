"""
FastAPI Microservice for Stash RAG & Text Embedding Pipeline
Built with FastAPI, LangChain, and Google Gemini Flash 2.5 (gemini-2.5-flash).
"""

import os
from typing import List, Optional
from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load local environment variables (.env in rag-service/)
load_dotenv()

from pipeline import construct_retrieval_text, TextEmbeddingPipeline
from rag_chain import StashRAGChain
from pinecone_service import PineconeManager

app = FastAPI(
    title="Stash RAG & Embedding Service",
    description="Privacy-preserving text embedding, Pinecone vector storage, & LangChain RAG pipeline using Google Gemini Flash 2.5",
    version="1.1.0"
)

# Enable CORS for local cross-service communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize pipelines
rag_chain = StashRAGChain()
embed_pipeline = TextEmbeddingPipeline()
pinecone_manager = PineconeManager()


# Pydantic Schemas
class EmbedRequest(BaseModel):
    caption: str = Field(..., description="Semantic caption of the image")
    keywords: Optional[List[str]] = Field(default=[], description="Keywords associated with the image")

class EmbedResponse(BaseModel):
    retrievalText: str
    dimensions: int
    embedding: List[float]

class BatchEmbedItem(BaseModel):
    imageId: str
    caption: str
    keywords: Optional[List[str]] = []

class BatchEmbedRequest(BaseModel):
    items: List[BatchEmbedItem]

class ImageContext(BaseModel):
    imageId: str
    caption: str
    keywords: Optional[List[str]] = []
    retrievalText: Optional[str] = None
    embedding: Optional[List[float]] = None

class RagAskRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=500, description="User's query")
    images: List[ImageContext] = Field(default=[], description="User-scoped candidate photos")
    top_k: Optional[int] = Field(default=5, ge=1, le=20)
    userId: Optional[str] = None

class ReferencedImage(BaseModel):
    imageId: str
    caption: str
    keywords: List[str] = []
    similarity: Optional[float] = None

class RagAskResponse(BaseModel):
    question: str
    answer: str
    model: str
    referencedImages: List[ReferencedImage]

# Phase 32: Pinecone Vector Schemas
class PineconeItem(BaseModel):
    imageId: str = Field(..., description="Unique Image ID")
    embedding: List[float] = Field(..., description="Dense semantic vector embedding")

class PineconeUpsertRequest(BaseModel):
    userId: str = Field(..., description="User ID for strict namespace isolation and ownership")
    items: List[PineconeItem] = Field(..., description="List of vector items to store")

class PineconeQueryRequest(BaseModel):
    userId: str = Field(..., description="User ID for strict namespace isolation and ownership")
    vector: List[float] = Field(..., description="Dense query vector")
    top_k: Optional[int] = Field(default=5, ge=1, le=50)

class PineconeDeleteRequest(BaseModel):
    userId: str = Field(..., description="User ID for strict namespace isolation and ownership")
    imageIds: List[str] = Field(..., description="List of Image IDs to purge from namespace")


@app.get("/health")
def health_check():
    """Health check endpoint providing model telemetry, API key status, and Pinecone connection status."""
    has_key = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    return {
        "status": "online",
        "service": "Stash RAG & Text Embedding Pipeline",
        "llmModel": rag_chain.model_name,
        "embeddingModel": embed_pipeline.model_name,
        "geminiApiKeyConfigured": has_key,
        "langchainActive": bool(rag_chain.chain),
        "pinecone": pinecone_manager.get_status()
    }


@app.post("/reload-key")
def reload_api_key():
    """Reloads API keys from .env file without restarting the service."""
    load_dotenv(override=True)
    new_gemini_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    rag_chain.reload_key(new_gemini_key)
    embed_pipeline.__init__(api_key=new_gemini_key)
    pinecone_manager.reload()
    return {
        "message": "Configuration reloaded successfully",
        "hasGeminiKey": bool(new_gemini_key),
        "langchainActive": bool(rag_chain.chain),
        "pinecone": pinecone_manager.get_status()
    }


@app.post("/embed", response_model=EmbedResponse)
def embed_single_image_text(req: EmbedRequest):
    """
    Phase 31: Construct retrieval text and compute dense vector embedding.
    Text embedding ONLY — zero raw image binary processing.
    """
    retrieval_text = construct_retrieval_text(req.caption, req.keywords)
    vector = embed_pipeline.embed_text(retrieval_text)
    return {
        "retrievalText": retrieval_text,
        "dimensions": len(vector),
        "embedding": vector
    }


@app.post("/embed/batch")
def embed_batch_images(req: BatchEmbedRequest):
    """
    Batch constructs retrieval text and embeds multiple items.
    """
    results = []
    for item in req.items:
        retrieval_text = construct_retrieval_text(item.caption, item.keywords)
        vector = embed_pipeline.embed_text(retrieval_text)
        results.append({
            "imageId": item.imageId,
            "retrievalText": retrieval_text,
            "dimensions": len(vector),
            "embedding": vector
        })
    return {"items": results, "count": len(results)}


@app.post("/rag/ask", response_model=RagAskResponse)
def ask_question(req: RagAskRequest):
    """
    Phase 31 & 32: LangChain RAG pipeline using Google Gemini Flash 2.5 and Pinecone.
    Answers natural language questions over the user's private photo captions.
    """
    images_dict = [img.model_dump() for img in req.images]
    result = rag_chain.ask(req.question, images_dict, top_k=req.top_k, user_id=req.userId)
    return result


# =======================================================
# Phase 32: Pinecone Vector Store Endpoints
# Strict User Isolation (Namespace + Ownership Validation)
# =======================================================

@app.post("/pinecone/upsert")
def pinecone_upsert(req: PineconeUpsertRequest):
    """
    Phase 32: Upsert vector embeddings strictly into the user's namespace.
    Stores:
    {
        id: imageId,
        values: embedding,
        metadata: {
            userId: req.userId
        }
    }
    Zero file paths or photo binaries stored.
    """
    if not req.userId or not req.userId.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="userId is required for user-isolated Pinecone storage"
        )

    items_dict = [item.model_dump() for item in req.items]
    res = pinecone_manager.upsert_vectors(user_id=req.userId.strip(), items=items_dict)
    return res


@app.post("/pinecone/query")
def pinecone_query(req: PineconeQueryRequest):
    """
    Phase 32: Queries nearest vectors strictly within the user's namespace.
    Validates ownership to ensure cross-user isolation.
    """
    if not req.userId or not req.userId.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="userId is required for user-isolated Pinecone query"
        )

    matches = pinecone_manager.query_vectors(
        user_id=req.userId.strip(),
        vector=req.vector,
        top_k=req.top_k
    )
    return {
        "userId": req.userId.strip(),
        "namespace": req.userId.strip(),
        "matches": matches,
        "count": len(matches)
    }


@app.post("/pinecone/delete")
def pinecone_delete(req: PineconeDeleteRequest):
    """
    Phase 32: Deletes vector IDs strictly from the user's namespace.
    """
    if not req.userId or not req.userId.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="userId is required for user-isolated Pinecone delete"
        )

    res = pinecone_manager.delete_vectors(user_id=req.userId.strip(), image_ids=req.imageIds)
    return res


@app.get("/pinecone/status")
def pinecone_status(userId: Optional[str] = None):
    """
    Phase 32: Telemetry status of Pinecone connection and user namespace isolation.
    """
    return pinecone_manager.get_status(user_id=userId)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    print(f"[RAG Service] Starting FastAPI RAG service on http://{host}:{port}...")
    uvicorn.run(app, host=host, port=port)
