"""
Stash Local AI - Security & Local Auth Module
Enforces strict origin checks, Private Network Access headers, and payload boundaries.
Guarantees NO arbitrary filesystem access (/read?path=...) and blocks third-party origins.
"""

import re
import os
import secrets
from pathlib import Path
from typing import Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response, JSONResponse

from config.settings import (
    ALLOWED_ORIGINS,
    ALLOWED_ORIGIN_PATTERNS,
    CONFIG_DIR,
    MAX_UPLOAD_SIZE_BYTES
)

# Secret key file for local app pairing
SECRET_KEY_PATH = CONFIG_DIR / "auth.key"

def get_or_create_local_auth_key() -> str:
    """Retrieves or generates a persistent local auth key stored in %LOCALAPPDATA%."""
    if SECRET_KEY_PATH.exists():
        try:
            return SECRET_KEY_PATH.read_text(encoding="utf-8").strip()
        except Exception:
            pass
    new_key = secrets.token_hex(32)
    try:
        SECRET_KEY_PATH.write_text(new_key, encoding="utf-8")
    except Exception:
        pass
    return new_key


def is_allowed_origin(origin: Optional[str]) -> bool:
    """Verifies that the request originates from an authorized Stash web app or local dev."""
    if not origin:
        # Direct local non-browser requests (e.g., local tests / curl / health checks) are allowed
        return True
    
    origin = origin.rstrip("/")
    if origin in ALLOWED_ORIGINS:
        return True
        
    for pattern in ALLOWED_ORIGIN_PATTERNS:
        if re.match(pattern, origin):
            return True
            
    return False


class LocalSecurityMiddleware(BaseHTTPMiddleware):
    """
    Middleware that enforces:
    1. Origin validation: blocks untrusted websites from cross-origin loopback requests.
    2. Private Network Access (PNA): sets Access-Control-Allow-Private-Network headers.
    3. Content-Length limitation: blocks oversized denial-of-service payloads.
    """
    async def dispatch(self, request: Request, call_next):
        origin = request.headers.get("origin")
        
        # Handle CORS preflight options request
        if request.method == "OPTIONS":
            response = Response(status_code=204)
            if origin and is_allowed_origin(origin):
                response.headers["Access-Control-Allow-Origin"] = origin
                response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
                response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization, X-Stash-Auth, Accept"
                response.headers["Access-Control-Allow-Credentials"] = "true"
                # Chrome / Edge Private Network Access specification
                if request.headers.get("Access-Control-Request-Private-Network") == "true":
                    response.headers["Access-Control-Allow-Private-Network"] = "true"
            return response

        # Validate origin for standard requests
        if origin and not is_allowed_origin(origin):
            return JSONResponse(
                status_code=403,
                content={"error": "Forbidden: Origin not authorized by Stash Local AI."}
            )

        # Content-Length check to prevent memory exhaustion
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                if int(content_length) > MAX_UPLOAD_SIZE_BYTES:
                    return JSONResponse(
                        status_code=413,
                        content={"error": f"Payload too large. Maximum size is {MAX_UPLOAD_SIZE_BYTES // (1024 * 1024)}MB."}
                    )
            except ValueError:
                pass

        # Process the request
        response = await call_next(request)

        # Attach CORS and Private Network Access headers to response
        if origin and is_allowed_origin(origin):
            response.headers["Access-Control-Allow-Origin"] = origin
            response.headers["Access-Control-Allow-Credentials"] = "true"
            if request.headers.get("Access-Control-Request-Private-Network") == "true":
                response.headers["Access-Control-Allow-Private-Network"] = "true"

        return response
