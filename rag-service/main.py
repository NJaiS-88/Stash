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

app = FastAPI(
    title="Stash RAG & Embedding Service",
    description="Privacy-preserving text embedding & LangChain RAG pipeline using Google Gemini Flash 2.5",
    version="1.0.0"
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


@app.get("/health")
def health_check():
    """Health check endpoint providing model telemetry and API key status."""
    has_key = bool(os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY"))
    return {
        "status": "online",
        "service": "Stash RAG & Text Embedding Pipeline",
        "llmModel": rag_chain.model_name,
        "embeddingModel": embed_pipeline.model_name,
        "geminiApiKeyConfigured": has_key,
        "langchainActive": bool(rag_chain.chain)
    }


@app.post("/reload-key")
def reload_api_key():
    """Reloads API key from .env file without restarting the service."""
    load_dotenv(override=True)
    new_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    rag_chain.reload_key(new_key)
    embed_pipeline.__init__(api_key=new_key)
    return {
        "message": "API key reloaded successfully",
        "hasKey": bool(new_key),
        "langchainActive": bool(rag_chain.chain)
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
    Phase 31: LangChain RAG pipeline using Google Gemini Flash 2.5.
    Answers natural language questions over the user's private photo captions.
    """
    images_dict = [img.model_dump() for img in req.images]
    result = rag_chain.ask(req.question, images_dict, top_k=req.top_k)
    return result


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    host = os.getenv("HOST", "127.0.0.1")
    print(f"[RAG Service] Starting FastAPI RAG service on http://{host}:{port}...")
    uvicorn.run(app, host=host, port=port)
