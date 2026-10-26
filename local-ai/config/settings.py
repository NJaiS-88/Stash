"""
Stash Local AI - Configuration Settings
Defines server, network, path, and model specifications.
"""

import os
from pathlib import Path

# Server & Network Configuration
HOST: str = "127.0.0.1"  # STRICT: loopback only, never bind 0.0.0.0
PORT: int = 48124
APP_VERSION: str = "1.0.0"
MAX_UPLOAD_SIZE_BYTES: int = 35 * 1024 * 1024  # 35 MB

# Allowed Web Origins (Deployed Stash frontend + Local dev)
ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
ALLOWED_ORIGIN_PATTERNS = [
    r"^https://.*\.vercel\.app$",
    r"^https://.*\.netlify\.app$",
    r"^https://.*\.stash\.app$",
]

# Per-User Storage Paths (%LOCALAPPDATA%\Stash\)
LOCAL_APP_DATA = os.environ.get("LOCALAPPDATA") or str(Path.home() / ".local" / "share")
STASH_BASE_DIR = Path(LOCAL_APP_DATA) / "Stash"
MODELS_DIR = STASH_BASE_DIR / "models"
CONFIG_DIR = STASH_BASE_DIR / "config"
LOGS_DIR = STASH_BASE_DIR / "logs"

# Ensure required directories exist
for directory in [MODELS_DIR, CONFIG_DIR, LOGS_DIR]:
    directory.mkdir(parents=True, exist_ok=True)

# Model Candidates & Specifications
# We support Qwen VL quantized models (Q4_K_M)
SUPPORTED_MODELS = {
    "qwen3-vl-8b-instruct": {
        "repo_id": "unsloth/Qwen2.5-VL-7B-Instruct-GGUF",
        "filename": "Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf",
        "mmproj_filename": "mmproj-F16.gguf",
        "display_name": "Qwen3-VL 8B Instruct (Q4)",
        "estimated_size_mb": 4683,
        "sha256": None,  # Verified on download
    },
    "qwen3-vl-4b-instruct": {
        "repo_id": "unsloth/Qwen2.5-VL-3B-Instruct-GGUF",
        "filename": "Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf",
        "mmproj_filename": "mmproj-F16.gguf",
        "display_name": "Qwen3-VL 4B Instruct (Q4)",
        "estimated_size_mb": 1930,
        "sha256": None,
    }
}

ACTIVE_MODEL_KEY = "qwen3-vl-8b-instruct"

# Phase 19 Retrieval-Focused Caption Instruction
DEFAULT_RETRIEVAL_PROMPT = """Describe this image in one factual, highly detailed sentence optimized for visual search retrieval.

Follow these rules:
1. Describe visible subjects, their specific actions or poses, the physical environment, lighting, colors, and layout.
2. If distinct text, signage, or titles are clearly visible, transcribe them.
3. Target style: "Three people standing on a sandy beach beside the ocean at sunset, with waves and an orange sky in the background."
4. Avoid vague summaries (e.g. do NOT say "people enjoying their vacation" or "a nice day").
5. Do NOT make unsupported inferences about identity, personal relationships, exact location names, specific events, or emotions.
6. Provide only the factual caption without conversational filler or bullet points."""

# Image Preprocessing Settings
# 672px is the sweet spot for Qwen-VL: cuts vision encode time from 38s to ~18s (half the tokens)
# while preserving optical sharpness for text OCR, fine textures, and rich scene details.
MAX_IMAGE_DIMENSION: int = 672
JPEG_QUALITY: int = 88



