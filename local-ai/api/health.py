"""
Stash Local AI - Health API Route
Fast loopback endpoint for client availability detection.
Does NOT perform heavy inference or block event loop.
"""

from fastapi import APIRouter
from config.settings import APP_VERSION, ACTIVE_MODEL_KEY
from inference.model_manager import ModelManager

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    """
    Returns immediate status to web frontend.
    Allows Stash website to rapidly detect if local helper is running.
    """
    mgr = ModelManager.get_instance()
    is_ready = mgr.is_ready()
    
    return {
        "status": "ready" if is_ready else "initializing",
        "appVersion": APP_VERSION,
        "modelReady": is_ready,
        "model": ACTIVE_MODEL_KEY,
        "device": "gpu"
    }
