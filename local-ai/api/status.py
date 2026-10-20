"""
Stash Local AI - Status & Model Management Route
Exposes operational states, device info, download progress, live logs,
and an interactive Web Dashboard at http://127.0.0.1:48124/.
"""

import os
import sys
from pathlib import Path
from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse, JSONResponse
from inference.model_manager import ModelManager, ModelStatus
from config.settings import LOGS_DIR, MODELS_DIR, APP_VERSION, ACTIVE_MODEL_KEY, HOST, PORT

router = APIRouter(tags=["Status"])


@router.get("/status")
async def get_service_status():
    """Returns safe runtime and model status without exposing private paths."""
    mgr = ModelManager.get_instance()
    return mgr.get_status_dict()


@router.get("/logs", response_class=PlainTextResponse)
async def get_recent_logs(lines: int = 80):
    """Returns the most recent log lines for live debugging."""
    log_file = LOGS_DIR / "local_ai.log"
    if not log_file.exists():
        return "No log file found yet. Service started recently."
    try:
        with open(log_file, "r", encoding="utf-8", errors="replace") as f:
            all_lines = f.readlines()
            recent = all_lines[-lines:] if len(all_lines) > lines else all_lines
            return "".join(recent)
    except Exception as e:
        return f"Error reading log file: {e}"


@router.get("/debug-info")
async def get_debug_info():
    """Detailed diagnostic information about environment and model files."""
    mgr = ModelManager.get_instance()

    llama_status = "Not installed"
    llama_version = None
    try:
        import llama_cpp
        llama_status = "Installed"
        llama_version = getattr(llama_cpp, "__version__", "unknown")
    except Exception as e:
        llama_status = f"Failed to load: {e}"

    model_file = mgr.model_path
    mmproj_file = mgr.mmproj_path

    return {
        "appVersion": APP_VERSION,
        "pythonVersion": sys.version,
        "llamaCpp": {
            "status": llama_status,
            "version": llama_version
        },
        "modelStatus": mgr.status.value,
        "activeModelKey": mgr.active_model_key,
        "hardware": {
            "cpuCores": os.cpu_count() or 4,
            "inferenceThreads": max(1, (os.cpu_count() or 4) - 1),
            "mode": "CPU (Optimized Multi-thread)"
        },
        "errorMessage": mgr.error_message,
        "files": {
            "mainModel": {
                "name": model_file.name,
                "exists": model_file.exists(),
                "sizeMb": round(model_file.stat().st_size / (1024 * 1024), 1) if model_file.exists() else 0
            },
            "visionProjector": {
                "name": mmproj_file.name,
                "exists": mmproj_file.exists(),
                "sizeMb": round(mmproj_file.stat().st_size / (1024 * 1024), 1) if mmproj_file.exists() else 0
            }
        }
    }


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


@router.get("/", response_class=HTMLResponse)
async def service_dashboard():
    """Interactive visual dashboard for inspecting Stash Local AI status, logs, and testing inference."""
    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stash Local AI — Diagnostic Dashboard</title>
    <style>
        :root {
            --bg: #0f172a;
            --surface: #1e293b;
            --surface-border: #334155;
            --primary: #10b981;
            --primary-hover: #059669;
            --text: #f8fafc;
            --text-muted: #94a3b8;
            --danger: #ef4444;
            --warning: #f59e0b;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: var(--bg);
            color: var(--text);
            padding: 24px;
            line-height: 1.5;
        }
        .container { max-width: 960px; margin: 0 auto; }
        .header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-bottom: 20px;
            border-bottom: 1px solid var(--surface-border);
            margin-bottom: 24px;
        }
        .title-group { display: flex; align-items: center; gap: 12px; }
        .logo { font-size: 1.8rem; }
        h1 { font-size: 1.4rem; font-weight: 700; }
        .badge {
            font-size: 0.75rem;
            padding: 4px 10px;
            border-radius: 999px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .badge-ready { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid #10b981; }
        .badge-downloading { background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid #f59e0b; }
        .badge-error { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid #ef4444; }
        .badge-offline { background: rgba(148, 163, 184, 0.2); color: #cbd5e1; border: 1px solid #64748b; }

        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .card {
            background: var(--surface);
            border: 1px solid var(--surface-border);
            border-radius: 12px;
            padding: 18px;
        }
        .card-title {
            font-size: 0.85rem;
            text-transform: uppercase;
            color: var(--text-muted);
            font-weight: 600;
            margin-bottom: 10px;
            letter-spacing: 0.5px;
        }
        .stat-value { font-size: 1.25rem; font-weight: 600; }
        .stat-detail { font-size: 0.82rem; color: var(--text-muted); margin-top: 4px; }

        .progress-bar-container {
            width: 100%;
            height: 8px;
            background: #334155;
            border-radius: 4px;
            overflow: hidden;
            margin-top: 10px;
        }
        .progress-bar {
            height: 100%;
            background: var(--primary);
            width: 0%;
            transition: width 0.3s ease;
        }

        .section-title {
            font-size: 1.05rem;
            font-weight: 600;
            margin-bottom: 12px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .btn {
            background: var(--primary);
            color: #042f2e;
            border: none;
            padding: 8px 14px;
            border-radius: 6px;
            font-weight: 600;
            font-size: 0.85rem;
            cursor: pointer;
            transition: opacity 0.2s;
        }
        .btn:hover { opacity: 0.9; }
        .btn-outline {
            background: transparent;
            color: var(--text);
            border: 1px solid var(--surface-border);
        }
        .btn-outline:hover { background: var(--surface-border); }

        .log-terminal {
            background: #020617;
            border: 1px solid var(--surface-border);
            border-radius: 8px;
            padding: 14px;
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
            font-size: 0.8rem;
            color: #e2e8f0;
            height: 240px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
        }

        .test-box {
            display: flex;
            gap: 16px;
            align-items: center;
            flex-wrap: wrap;
            margin-top: 12px;
            padding: 16px;
            background: rgba(2, 6, 23, 0.4);
            border: 1px dashed var(--surface-border);
            border-radius: 8px;
        }
        input[type="file"] { font-size: 0.85rem; color: var(--text-muted); }
        .caption-result {
            margin-top: 12px;
            padding: 12px;
            background: rgba(16, 185, 129, 0.1);
            border: 1px solid #10b981;
            border-radius: 6px;
            font-size: 0.88rem;
            display: none;
        }
        .caption-result.error {
            background: rgba(239, 68, 68, 0.1);
            border-color: #ef4444;
            color: #fca5a5;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="title-group">
                <span class="logo">⚡</span>
                <div>
                    <h1>Stash Local AI Helper</h1>
                    <div style="font-size: 0.8rem; color: var(--text-muted);">Loopback Service on 127.0.0.1:48124</div>
                </div>
            </div>
            <div id="statusBadge" class="badge badge-offline">Connecting...</div>
        </div>

        <div class="grid">
            <div class="card">
                <div class="card-title">Inference Engine</div>
                <div id="engineStatus" class="stat-value">Loading...</div>
                <div id="engineDetail" class="stat-detail">Checking llama-cpp-python runtime...</div>
            </div>

            <div class="card">
                <div class="card-title">Model Weights (4.6 GB)</div>
                <div id="modelFileStatus" class="stat-value">Checking...</div>
                <div id="modelFileDetail" class="stat-detail">Qwen2.5-VL-7B-Instruct-Q4_K_M.gguf</div>
            </div>

            <div class="card">
                <div class="card-title">Vision Projector (1.35 GB)</div>
                <div id="projectorFileStatus" class="stat-value">Checking...</div>
                <div id="projectorFileDetail" class="stat-detail">mmproj-F16.gguf</div>
            </div>
        </div>

        <div id="downloadCard" class="card" style="margin-bottom: 24px; display: none;">
            <div class="card-title" style="display: flex; justify-content: space-between;">
                <span>Downloading Weights</span>
                <span id="downloadPercent">0%</span>
            </div>
            <div class="progress-bar-container">
                <div id="downloadBar" class="progress-bar"></div>
            </div>
            <div id="downloadDetails" style="font-size: 0.8rem; color: var(--text-muted); margin-top: 8px;">
                Downloading streaming chunks directly from Hugging Face...
            </div>
        </div>

        <div id="errorCard" class="card" style="margin-bottom: 24px; border-color: #ef4444; background: rgba(239, 68, 68, 0.1); display: none;">
            <div class="card-title" style="color: #f87171;">⚠️ Last Error Trace</div>
            <div id="errorMessage" style="font-size: 0.88rem; color: #fca5a5; font-family: monospace;"></div>
            <div style="margin-top: 12px;">
                <button class="btn" onclick="triggerDownload()">Retry Download</button>
            </div>
        </div>

        <div class="card" style="margin-bottom: 24px;">
            <div class="section-title">
                <span>🧪 Quick Test Inference</span>
                <span style="font-size: 0.8rem; font-weight: normal; color: var(--text-muted);">Test local VLM captioning directly</span>
            </div>
            <div class="test-box">
                <input type="file" id="testImageInput" accept="image/*" />
                <button id="testBtn" class="btn" onclick="runTestCaption()">Generate Test Caption</button>
            </div>
            <div id="captionResult" class="caption-result"></div>
        </div>

        <div class="card">
            <div class="section-title">
                <span>📋 Live Console Logs</span>
                <div>
                    <button class="btn btn-outline" style="padding: 4px 10px; font-size: 0.75rem;" onclick="fetchLogs()">Refresh Logs</button>
                </div>
            </div>
            <div id="logTerminal" class="log-terminal">Loading service logs...</div>
        </div>
    </div>

    <script>
        async function fetchStatus() {
            try {
                const res = await fetch('/debug-info');
                if (!res.ok) throw new Error('Status HTTP ' + res.status);
                const data = await res.json();

                const badge = document.getElementById('statusBadge');
                badge.className = 'badge';
                if (data.modelStatus === 'READY') {
                    badge.classList.add('badge-ready');
                    badge.textContent = '🟢 Ready';
                } else if (data.modelStatus === 'DOWNLOADING') {
                    badge.classList.add('badge-downloading');
                    badge.textContent = '⏳ Downloading';
                } else if (data.modelStatus === 'ERROR') {
                    badge.classList.add('badge-error');
                    badge.textContent = '⚠️ Error';
                } else {
                    badge.classList.add('badge-offline');
                    badge.textContent = data.modelStatus;
                }

                // Engine
                document.getElementById('engineStatus').textContent = data.llamaCpp.status;
                const hwInfo = data.hardware ? ` • ${data.hardware.mode} (${data.hardware.inferenceThreads} threads)` : ' • CPU Mode';
                document.getElementById('engineDetail').textContent = (data.llamaCpp.version ? ('v' + data.llamaCpp.version) : 'Runtime') + hwInfo;

                // Model file
                const mf = data.files.mainModel;
                document.getElementById('modelFileStatus').textContent = mf.exists ? (mf.sizeMb + ' MB') : 'Missing';
                document.getElementById('modelFileStatus').style.color = mf.exists ? '#34d399' : '#f87171';

                // Projector file
                const pf = data.files.visionProjector;
                document.getElementById('projectorFileStatus').textContent = pf.exists ? (pf.sizeMb + ' MB') : 'Missing';
                document.getElementById('projectorFileStatus').style.color = pf.exists ? '#34d399' : '#f87171';

                // Error
                const errCard = document.getElementById('errorCard');
                if (data.errorMessage) {
                    errCard.style.display = 'block';
                    document.getElementById('errorMessage').textContent = data.errorMessage;
                } else {
                    errCard.style.display = 'none';
                }

                // Downloading bar
                const dlCard = document.getElementById('downloadCard');
                if (data.modelStatus === 'DOWNLOADING') {
                    dlCard.style.display = 'block';
                    const stRes = await fetch('/status');
                    if (stRes.ok) {
                        const st = await stRes.json();
                        const p = st.downloadProgress || 0;
                        document.getElementById('downloadPercent').textContent = p + '%';
                        document.getElementById('downloadBar').style.width = p + '%';
                        if (st.downloadedBytes && st.totalBytes) {
                            const mbDown = Math.round(st.downloadedBytes / (1024 * 1024));
                            const mbTotal = Math.round(st.totalBytes / (1024 * 1024));
                            document.getElementById('downloadDetails').textContent = `${mbDown} MB of ${mbTotal} MB downloaded...`;
                        }
                    }
                } else {
                    dlCard.style.display = 'none';
                }
            } catch (err) {
                const badge = document.getElementById('statusBadge');
                badge.className = 'badge badge-offline';
                badge.textContent = 'Offline';
            }
        }

        async function fetchLogs() {
            try {
                const res = await fetch('/logs?lines=80');
                if (res.ok) {
                    const text = await res.text();
                    const term = document.getElementById('logTerminal');
                    term.textContent = text;
                    term.scrollTop = term.scrollHeight;
                }
            } catch {}
        }

        async function triggerDownload() {
            try {
                await fetch('/download-model', { method: 'POST' });
                fetchStatus();
            } catch (e) {
                alert('Failed to trigger download: ' + e);
            }
        }

        async function runTestCaption() {
            const input = document.getElementById('testImageInput');
            const file = input.files[0];
            const resultBox = document.getElementById('captionResult');
            const btn = document.getElementById('testBtn');

            if (!file) {
                alert('Please select an image file to test.');
                return;
            }

            btn.disabled = true;
            btn.textContent = 'Analyzing...';
            resultBox.style.display = 'block';
            resultBox.className = 'caption-result';
            resultBox.textContent = 'Sending image to local Qwen-VL model on 127.0.0.1:48124/caption...';

            const formData = new FormData();
            formData.append('image', file);

            try {
                const res = await fetch('/caption', {
                    method: 'POST',
                    body: formData
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.detail || JSON.stringify(data));
                }
                resultBox.className = 'caption-result';
                resultBox.innerHTML = `<strong>Generated Caption:</strong><br>${data.caption}<br><br><span style="color:#94a3b8; font-size:0.8rem;">Keywords: ${data.keywords.join(', ')}</span>`;
            } catch (err) {
                resultBox.className = 'caption-result error';
                resultBox.textContent = 'Inference Error: ' + err.message;
            } finally {
                btn.disabled = false;
                btn.textContent = 'Generate Test Caption';
                fetchLogs();
            }
        }

        // Auto poll
        fetchStatus();
        fetchLogs();
        setInterval(fetchStatus, 2000);
        setInterval(fetchLogs, 3000);
    </script>
</body>
</html>
"""
    return HTMLResponse(content=html)
