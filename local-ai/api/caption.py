"""
Stash Local AI - Caption API Route
Secure endpoint accepting in-memory image uploads for local VLM captioning.
Strictly rejects arbitrary file paths to prevent unauthorized filesystem access.
"""

from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status
from inference.captioner import generate_caption

router = APIRouter(tags=["Caption"])


@router.post("/caption")
async def caption_image(
    image: UploadFile = File(..., description="Binary image file to caption"),
    prompt: Optional[str] = Form(None, description="Optional custom retrieval prompt"),
    imageId: Optional[str] = Form(None, description="Client-side unique image identifier"),
    maxTokens: int = Form(120, description="Maximum token length for caption")
):
    """
    Performs local VLM inference on uploaded image binary.
    The image is processed exclusively in memory and never persisted or leaked to the cloud.
    """
    # Validate content type
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file type. Only image files are accepted."
        )

    try:
        image_bytes = await image.read()
        if not image_bytes:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Empty image payload received."
            )

        from inference.model_manager import ModelManager
        model_mgr = ModelManager.get_instance()
        if not model_mgr.is_ready():
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail=f"Model weights are not ready. Current status: {model_mgr.status.value}. Please initiate download via POST /download-model."
            )

        result = await generate_caption(
            image_bytes=image_bytes,
            prompt=prompt,
            image_id=imageId,
            max_tokens=maxTokens
        )
        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Local captioning inference failed: {str(e)}"
        )
