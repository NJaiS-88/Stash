"""
Stash Local AI - Status & Model Management Route
Exposes operational states, device info, and download progress.
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException
from inference.model_manager import ModelManager, ModelStatus

router = APIRouter(tags=["Status"])


@router.get("/status")
async def get_service_status():
    """Returns safe runtime and model status without exposing private paths."""
    mgr = ModelManager.get_instance()
    return mgr.get_status_dict()


@router.post("/download-model")
async def trigger_model_download(background_tasks: BackgroundTasks):
    """Initiates model download asynchronously in the background if needed."""
    mgr = ModelManager.get_instance()
    if mgr.status == ModelStatus.DOWNLOADING:
        return {"message": "Model download already in progress", "progress": mgr.download_progress}

    if mgr.is_ready():
        return {"message": "Model is already downloaded and ready"}

    # Run download in background task
    background_tasks.add_task(mgr.start_download)
    return {"message": "Model download initiated", "status": "DOWNLOADING"}
