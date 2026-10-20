"""
Stash Local AI - Verification Test Script
Tests loopback communication against 127.0.0.1:48124:
1. GET /health
2. GET /status
3. POST /caption with a sample test image
"""

import io
import sys
import json
import urllib.request
import urllib.error
from PIL import Image

BASE_URL = "http://127.0.0.1:48124"


def test_health():
    print("Testing GET /health...")
    try:
        req = urllib.request.Request(f"{BASE_URL}/health", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as res:
            data = json.loads(res.read().decode("utf-8"))
            print(f"✅ /health responded: {data}")
            assert "modelReady" in data
            return True
    except urllib.error.URLError as e:
        print(f"❌ Failed to reach {BASE_URL}/health: {e}")
        return False


def test_status():
    print("\nTesting GET /status...")
    try:
        req = urllib.request.Request(f"{BASE_URL}/status", headers={"Accept": "application/json"})
        with urllib.request.urlopen(req, timeout=3) as res:
            data = json.loads(res.read().decode("utf-8"))
            print(f"✅ /status responded: {data}")
            assert "status" in data
            return True
    except urllib.error.URLError as e:
        print(f"❌ Failed to reach {BASE_URL}/status: {e}")
        return False


def test_caption():
    print("\nTesting POST /caption...")
    # Generate a sample 200x200 RGB test image in memory
    img = Image.new("RGB", (200, 200), color=(73, 109, 137))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    image_bytes = buf.getvalue()

    boundary = "----WebKitFormBoundary7MA4YWxkTrZu0gW"
    body = bytearray()
    
    # Form field: image
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(b'Content-Disposition: form-data; name="image"; filename="test.jpg"\r\n')
    body.extend(b"Content-Type: image/jpeg\r\n\r\n")
    body.extend(image_bytes)
    body.extend(b"\r\n")

    # Form field: maxTokens
    body.extend(f"--{boundary}\r\n".encode("utf-8"))
    body.extend(b'Content-Disposition: form-data; name="maxTokens"\r\n\r\n')
    body.extend(b"60\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))

    try:
        req = urllib.request.Request(
            f"{BASE_URL}/caption",
            data=body,
            headers={
                "Content-Type": f"multipart/form-data; boundary={boundary}",
                "Origin": "http://localhost:5173"
            },
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode("utf-8"))
            print(f"✅ /caption responded: {data}")
            assert "caption" in data
            assert data.get("engine") == "local"
            return True
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8", errors="ignore")
        if e.code == 503:
            print(f"⚠️ /caption returned HTTP 503 (Expected: Model weights not downloaded yet)")
            print(f"   Detail: {error_body}")
            return True
        else:
            print(f"❌ /caption failed with HTTP {e.code}: {error_body}")
            return False
    except urllib.error.URLError as e:
        print(f"❌ Failed to reach /caption: {e}")
        return False


def test_trigger_download():
    print("\nInitiating model download via POST /download-model...")
    try:
        req = urllib.request.Request(
            f"{BASE_URL}/download-model",
            data=b"{}",
            headers={"Content-Type": "application/json", "Origin": "http://localhost:5173"},
            method="POST"
        )
        with urllib.request.urlopen(req, timeout=5) as res:
            data = json.loads(res.read().decode("utf-8"))
            print(f"✅ Download triggered: {data}")
            return True
    except Exception as e:
        print(f"❌ Failed to trigger download: {e}")
        return False


if __name__ == "__main__":
    print("=== Running Stash Local AI Verification ===")
    h_ok = test_health()
    s_ok = test_status()
    if h_ok and s_ok:
        test_caption()
        if "--download" in sys.argv:
            test_trigger_download()
    else:
        print("\nNote: Make sure Stash Local AI is running with 'python main.py' inside local-ai/")
