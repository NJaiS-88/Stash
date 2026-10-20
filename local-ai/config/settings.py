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

# Universal retrieval-oriented caption prompt across all image types
DEFAULT_RETRIEVAL_PROMPT = """Generate one concise, highly detailed factual caption for this image optimized for search retrieval.

Describe all visible information accurately:
- Image type & subjects: people, animals, landscapes, cityscapes, food, vehicles, objects, art, screenshots, documents, or UI.
- Visible text/titles: transcribe key legible text, titles, brand names, or error messages (for screenshots, receipts, signs, or slides).
- Context & attributes: activities, scene/setting, colors, lighting, materials, and layout.

Do not speculate on hidden identities, unverified relationships, or unseen facts. Return only the caption."""

# Image Preprocessing Settings
MAX_IMAGE_DIMENSION: int = 1344  # Optimal size for Qwen-VL without excessive VRAM
JPEG_QUALITY: int = 88
