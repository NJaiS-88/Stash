"""
Stash Local AI - Main Application Entrypoint
Runs FastAPI + Uvicorn bound strictly to 127.0.0.1:48124 (loopback only).
Coordinates security middleware, model manager, and inference routes.
"""

import sys
import os

# Crucial fix for windowless Windows executables (PyInstaller console=False):
# In windowless mode, sys.stdout and sys.stderr are None, causing uvicorn logger to crash on .isatty()
if sys.stdout is None:
    sys.stdout = open(os.devnull, "w", encoding="utf-8")
if sys.stderr is None:
    sys.stderr = open(os.devnull, "w", encoding="utf-8")

import logging
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI
import uvicorn

# Setup module search path
CURRENT_DIR = Path(__file__).resolve().parent
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

from config.settings import HOST, PORT, APP_VERSION, LOGS_DIR
from security.local_auth import LocalSecurityMiddleware
from api.health import router as health_router
from api.status import router as status_router
from api.caption import router as caption_router
from inference.model_manager import ModelManager

# Configure logging
log_file = LOGS_DIR / "local_ai.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.FileHandler(str(log_file), encoding="utf-8"),
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger("stash-local-ai")


import asyncio
from inference.model_manager import ModelManager, ModelStatus
import os

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle event handler for server startup and shutdown."""
    logger.info(f"Starting Stash Local AI Service v{APP_VERSION} on {HOST}:{PORT}...")
    model_mgr = ModelManager.get_instance()
    logger.info(f"Model status: {model_mgr.status.value} (Candidate: {model_mgr.active_model_key})")

    # Automatically start background download on first run if model is not installed
    if not model_mgr.is_ready() and model_mgr.status != ModelStatus.DOWNLOADING and os.environ.get("STASH_DEV_MODE") != "1":
        logger.info("Model weights missing: Initiating automatic background download...")
        asyncio.create_task(model_mgr.start_download())

    yield
    logger.info("Shutting down Stash Local AI Service...")


app = FastAPI(
    title="Stash Local AI",
    version=APP_VERSION,
    description="Local VLM inference service for private image captioning",
    lifespan=lifespan,
    docs_url=None,  # Disabled in production for minimal attack surface
    redoc_url=None
)

# Apply strict loopback security middleware
app.add_middleware(LocalSecurityMiddleware)

# Register endpoints
app.include_router(health_router)
app.include_router(status_router)
app.include_router(caption_router)


def run_uvicorn():
    """Runs the Uvicorn web server with live console and file logging."""
    config = uvicorn.Config(
        app,
        host=HOST,
        port=PORT,
        log_level="info",
        access_log=True
    )
    server = uvicorn.Server(config)
    server.run()


if __name__ == "__main__":
    try:
        run_uvicorn()
    except Exception as e:
        logger.error(f"Fatal error starting Stash Local AI: {e}", exc_info=True)
        print(f"\n[FATAL ERROR] {e}")
        try:
            input("\nPress Enter to exit...")
        except Exception:
            pass


