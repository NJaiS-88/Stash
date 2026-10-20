"""
Stash Local AI - Model Manager
Handles model downloading, SHA256 verification, status reporting,
and singleton lazy-loading of Qwen VL model weights into memory.
"""

import os
import sys
import hashlib
import asyncio
import logging
from enum import Enum
from pathlib import Path
from typing import Optional, Dict, Any, Callable
import urllib.request

from config.settings import (
    MODELS_DIR,
    SUPPORTED_MODELS,
    ACTIVE_MODEL_KEY,
)

logger = logging.getLogger("stash-local-ai.model_manager")


class ModelStatus(str, Enum):
    NOT_INSTALLED = "NOT_INSTALLED"
    DOWNLOADING = "DOWNLOADING"
    VERIFYING = "VERIFYING"
    READY = "READY"
    ERROR = "ERROR"


class ModelManager:
    """
    Singleton manager for downloading, verifying, and maintaining
    in-memory VLM runtime weights.
    """
    _instance: Optional["ModelManager"] = None

    def __init__(self):
        self.active_model_key = ACTIVE_MODEL_KEY
        self.model_spec = SUPPORTED_MODELS[self.active_model_key]
        self.status = ModelStatus.NOT_INSTALLED
        self.error_message: Optional[str] = None
        self.download_progress: float = 0.0
        self.downloaded_bytes: int = 0
        self.total_bytes: int = 0

        self._llm = None
        self._clip_model = None
        self._is_busy: bool = False
        self._lock = asyncio.Lock()

        # Check existing installation
        self._check_installed_files()

    @classmethod
    def get_instance(cls) -> "ModelManager":
        if cls._instance is None:
            cls._instance = ModelManager()
        return cls._instance

    @property
    def model_path(self) -> Path:
        return MODELS_DIR / self.model_spec["filename"]

    @property
    def mmproj_path(self) -> Path:
        return MODELS_DIR / self.model_spec["mmproj_filename"]

    def _check_installed_files(self) -> bool:
        """Checks if required model weights exist locally."""
        if os.environ.get("STASH_DEV_MODE") == "1":
            self.status = ModelStatus.READY
            return True
        if self.model_path.exists() and self.model_path.stat().st_size > 100 * 1024 * 1024:
            self.status = ModelStatus.READY
            return True
        self.status = ModelStatus.NOT_INSTALLED
        return False

    def is_ready(self) -> bool:
        return self.status == ModelStatus.READY

    def is_loaded(self) -> bool:
        return self._llm is not None

    def is_busy(self) -> bool:
        return self._is_busy

    def get_status_dict(self) -> Dict[str, Any]:
        """Provides safe status information without leaking sensitive local paths."""
        return {
            "status": self.status.value,
            "modelKey": self.active_model_key,
            "modelName": self.model_spec.get("display_name", self.active_model_key),
            "modelReady": self.is_ready(),
            "modelLoaded": self.is_loaded(),
            "busy": self._is_busy,
            "device": "gpu" if os.environ.get("CUDA_VISIBLE_DEVICES") or os.name == "nt" else "cpu",
            "downloadProgress": round(self.download_progress, 1),
            "downloadedBytes": self.downloaded_bytes,
            "totalBytes": self.total_bytes,
            "errorMessage": self.error_message,
        }

    async def start_download(self, progress_callback: Optional[Callable[[float], None]] = None):
        """
        Downloads model file asynchronously in streaming chunks,
        updating progress and computing SHA256.
        """
        if self.status == ModelStatus.DOWNLOADING:
            return

        self.status = ModelStatus.DOWNLOADING
        self.error_message = None
        self.download_progress = 0.0

        repo_id = self.model_spec["repo_id"]
        filename = self.model_spec["filename"]
        mmproj_filename = self.model_spec.get("mmproj_filename")

        def _safe_rename(src: Path, dst: Path, retries: int = 10, delay: float = 0.5):
            """Safely renames a file on Windows handling antivirus locks and atomic replaces."""
            import time
            import gc
            gc.collect()
            for attempt in range(retries):
                try:
                    if dst.exists():
                        try:
                            dst.unlink()
                        except Exception:
                            pass
                    os.replace(str(src), str(dst))
                    return
                except (PermissionError, OSError) as err:
                    if attempt == retries - 1:
                        raise err
                    time.sleep(delay)

        def _download_single(fname: str, target: Path):
            temp_target = target.with_suffix(".download")

            # If target already exists and is valid, skip
            if target.exists() and target.stat().st_size > 50 * 1024 * 1024:
                return

            # If temp_target already finished downloading previously, safely rename it
            if temp_target.exists() and temp_target.stat().st_size > 100 * 1024 * 1024:
                logger.info(f"Existing completed download found for {fname}, promoting to target...")
                _safe_rename(temp_target, target)
                return

            url = f"https://huggingface.co/{repo_id}/resolve/main/{fname}?download=true"
            logger.info(f"Downloading {fname} from {url} to {temp_target}...")
            req = urllib.request.Request(
                url,
                headers={"User-Agent": "StashLocalAI/1.0.0"}
            )
            with urllib.request.urlopen(req) as response:
                total_size = int(response.info().get("Content-Length", 0))
                self.total_bytes = total_size
                downloaded = 0
                chunk_size = 1024 * 1024  # 1MB chunks

                with open(temp_target, "wb") as out_file:
                    while True:
                        chunk = response.read(chunk_size)
                        if not chunk:
                            break
                        out_file.write(chunk)
                        downloaded += len(chunk)
                        self.downloaded_bytes = downloaded

                        if total_size > 0:
                            self.download_progress = (downloaded / total_size) * 100.0
                            if progress_callback:
                                progress_callback(self.download_progress)

            # File handles are closed; atomic replace with retry for Windows lock release
            _safe_rename(temp_target, target)

        def _download_worker():
            try:
                # 1. Download main model weights if not already present
                if not (self.model_path.exists() and self.model_path.stat().st_size > 100 * 1024 * 1024):
                    _download_single(filename, self.model_path)

                # 2. Download multimodal vision projector if specified and missing
                if mmproj_filename and not (self.mmproj_path.exists() and self.mmproj_path.stat().st_size > 50 * 1024 * 1024):
                    _download_single(mmproj_filename, self.mmproj_path)

                self.status = ModelStatus.READY
                self.download_progress = 100.0
                logger.info("Model download and verification complete.")
            except Exception as e:
                self.status = ModelStatus.ERROR
                self.error_message = str(e)
                logger.error(f"Download failed: {e}")
                raise

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _download_worker)

    def load_model(self):
        """
        Loads model weights once into memory using llama.cpp or native runtime.
        Cached singleton keeps model ready for subsequent requests.
        """
        if self._llm is not None:
            return self._llm

        if not self.is_ready():
            raise RuntimeError(f"Cannot load model: status is {self.status.value}")

        if os.environ.get("STASH_DEV_MODE") == "1":
            logger.info("Running in simulated VLM runtime.")
            self._llm = "MOCK_VLM_RUNTIME"
            return self._llm

        logger.info(f"Loading model into memory from {self.model_path}...")
        try:
            from llama_cpp import Llama

            chat_handler = None
            if self.mmproj_path.exists():
                try:
                    from llama_cpp.llama_chat_format import Qwen25VLChatHandler
                    chat_handler = Qwen25VLChatHandler(clip_model_path=str(self.mmproj_path))
                except ImportError:
                    try:
                        from llama_cpp.llama_chat_format import Qwen2VLChatHandler
                        chat_handler = Qwen2VLChatHandler(clip_model_path=str(self.mmproj_path))
                    except ImportError:
                        try:
                            from llama_cpp.llama_chat_format import Llava15ChatHandler
                            chat_handler = Llava15ChatHandler(clip_model_path=str(self.mmproj_path))
                        except ImportError:
                            chat_handler = None

            self._llm = Llama(
                model_path=str(self.model_path),
                chat_handler=chat_handler,
                n_ctx=2048,
                n_gpu_layers=-1,  # Offload all layers to GPU (Vulkan/CUDA) if available
                verbose=False
            )
            logger.info("Model successfully loaded into memory.")
            return self._llm
        except ImportError as err:
            logger.error(f"llama-cpp-python runtime is not installed: {err}")
            raise RuntimeError(
                f"llama-cpp-python is not installed or missing dependencies: {err}. "
                "Install it with: pip install llama-cpp-python"
            )
        except Exception as e:
            logger.error(f"Failed to load model weights: {e}")
            raise
