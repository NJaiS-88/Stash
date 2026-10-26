"""
Stash Local AI - Captioner Engine
Executes VLM captioning with strict single-job concurrency (Concurrency = 1).
Returns structured JSON with factual caption, search keywords, and engine provenance.
"""

import re
import uuid
import base64
import asyncio
import hashlib
import logging
from typing import Dict, Any, List, Optional
from PIL import Image

from config.settings import DEFAULT_RETRIEVAL_PROMPT, ACTIVE_MODEL_KEY
from inference.preprocessing import preprocess_image_bytes, image_to_jpeg_bytes
from inference.model_manager import ModelManager

logger = logging.getLogger("stash-local-ai.captioner")

# Strict Concurrency = 1 semaphore
INFERENCE_SEMAPHORE = asyncio.Semaphore(1)

# In-memory SHA-256 caption cache: prevents re-running model on identical images
CAPTION_CACHE: Dict[str, Dict[str, Any]] = {}

# Default Stopwords for Keyword Extraction
STOP_WORDS = {
    "a", "an", "the", "in", "on", "at", "is", "are", "was", "were", "it", "its",
    "of", "for", "to", "from", "with", "by", "and", "or", "that", "this", "there",
    "image", "picture", "photo", "photograph", "close", "up", "view", "background",
    "foreground", "side", "standing", "sitting", "showing", "shows"
}


def extract_keywords(caption: str) -> List[str]:
    """Extracts distinctive searchable tokens from the generated caption."""
    cleaned = re.sub(r"[^a-zA-Z0-9\s]", " ", caption.lower())
    tokens = [t for t in cleaned.split() if len(t) > 2 and t not in STOP_WORDS]
    seen = set()
    result = []
    for token in tokens:
        if token not in seen:
            seen.add(token)
            result.append(token)
    return result


async def generate_caption(
    image_bytes: bytes,
    prompt: Optional[str] = None,
    image_id: Optional[str] = None,
    max_tokens: int = 120
) -> Dict[str, Any]:
    """
    Runs single-concurrency VLM inference on preprocessed in-memory image.
    Outputs structured caption and search keywords.
    """
    final_image_id = image_id or str(uuid.uuid4())
    final_prompt = prompt or DEFAULT_RETRIEVAL_PROMPT

    # Fast SHA-256 hash cache: instant 0ms return if image was ever captioned before
    img_hash = hashlib.sha256(image_bytes).hexdigest()
    if img_hash in CAPTION_CACHE:
        logger.info(f"⚡ Instant Hash Cache Match ({img_hash[:10]}...): Reusing existing caption without re-running model!")
        cached = CAPTION_CACHE[img_hash].copy()
        cached["imageId"] = final_image_id
        return cached

    # Enforce concurrency = 1
    async with INFERENCE_SEMAPHORE:
        model_mgr = ModelManager.get_instance()
        model_mgr._is_busy = True

        try:
            logger.info("📸 Processing image for captioning...")
            pil_img = preprocess_image_bytes(image_bytes)
            jpeg_bytes = image_to_jpeg_bytes(pil_img)
            b64_image = base64.b64encode(jpeg_bytes).decode("utf-8")
            data_uri = f"data:image/jpeg;base64,{b64_image}"

            # 2. Ensure model is loaded (raises error if llama-cpp is missing, triggering browser fallback)
            llm = model_mgr.load_model()

            # Real llama-cpp vision chat completion
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_uri}},
                        {"type": "text", "text": final_prompt}
                    ]
                }
            ]
            # Balanced 85-token budget: rich 3-4 sentence descriptions while shaving 7 seconds off CPU decode
            effective_max_tokens = min(max_tokens, 85) if max_tokens else 85

            # Run blocking C++ model inference in worker thread pool so FastAPI event loop remains responsive
            loop = asyncio.get_running_loop()

            def _inference_worker():
                return llm.create_chat_completion(
                    messages=messages,
                    max_tokens=effective_max_tokens,
                    temperature=0.2,
                    stop=["<|im_end|>", "<|endoftext|>", "User:"]
                )

            response = await loop.run_in_executor(None, _inference_worker)
            caption_text = response["choices"][0]["message"]["content"].strip()

            # Clean any leftover wrapper quotes or reasoning tags
            caption_text = re.sub(r"^[\"']|[\"']$", "", caption_text).strip()
            logger.info(f"✅ Generated: \"{caption_text}\"")
            keywords = extract_keywords(caption_text)

            result = {
                "imageId": final_image_id,
                "caption": caption_text,
                "keywords": keywords,
                "engine": "local",
                "model": ACTIVE_MODEL_KEY,
                "captionVersion": 1
            }
            CAPTION_CACHE[img_hash] = result.copy()
            return result

        finally:
            model_mgr._is_busy = False
            # Phase 23: Release decoded image buffers immediately (8k-20k memory optimization)
            if "pil_img" in locals():
                del pil_img
            if "jpeg_bytes" in locals():
                del jpeg_bytes
            if "b64_image" in locals():
                del b64_image
            if "data_uri" in locals():
                del data_uri
            if "messages" in locals():
                del messages
            import gc
            gc.collect()
