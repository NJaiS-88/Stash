"""
Stash Local AI - Image Preprocessing
Decodes and resizes raw image bytes in memory for efficient VLM inference.
Corrects EXIF orientation, converts color spaces to RGB, and avoids persisting copies.
"""

import io
from typing import Tuple
from PIL import Image, ImageOps

from config.settings import MAX_IMAGE_DIMENSION, JPEG_QUALITY


def preprocess_image_bytes(image_bytes: bytes) -> Image.Image:
    """
    Decodes raw bytes, applies EXIF orientation, and downscales proportionally
    if larger than MAX_IMAGE_DIMENSION. Returns an in-memory RGB PIL Image.
    """
    with io.BytesIO(image_bytes) as stream:
        img = Image.open(stream)
        
        # Apply EXIF rotation if present (e.g., smartphone photos taken in portrait)
        try:
            img = ImageOps.exif_transpose(img)
        except Exception:
            pass

        # Ensure RGB color mode
        if img.mode != "RGB":
            img = img.convert("RGB")

        # Downscale proportionally if needed
        width, height = img.size
        max_dim = max(width, height)
        if max_dim > MAX_IMAGE_DIMENSION:
            scale = MAX_IMAGE_DIMENSION / float(max_dim)
            new_width = int(round(width * scale))
            new_height = int(round(height * scale))
            img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
            
        # Copy to decouple from the stream buffer before closing
        return img.copy()


def image_to_jpeg_bytes(img: Image.Image) -> bytes:
    """Encodes PIL Image into optimized JPEG bytes for model consumption."""
    buffer = io.BytesIO()
    img.save(buffer, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buffer.getvalue()
