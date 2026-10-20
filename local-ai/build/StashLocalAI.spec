# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller Specification for Stash Local AI
Compiles standalone StashLocalAI.exe with embedded Uvicorn and FastAPI runtime.
"""

import sys
from pathlib import Path
from PyInstaller.utils.hooks import collect_all

block_cipher = None
project_root = Path(SPECPATH).parent.resolve()

# Automatically collect all compiled DLLs, shared libs, and modules for llama-cpp-python
try:
    llama_datas, llama_binaries, llama_hiddenimports = collect_all('llama_cpp')
except Exception:
    llama_datas, llama_binaries, llama_hiddenimports = [], [], []

a = Analysis(
    [str(project_root / 'main.py')],
    pathex=[str(project_root)],
    binaries=llama_binaries,
    datas=llama_datas,
    hiddenimports=[
        'llama_cpp',
        'llama_cpp.llama_chat_format',
        'uvicorn',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespans',
        'uvicorn.lifespans.on',
        'fastapi',
        'starlette',
        'pydantic',
        'PIL',
        'PIL.Image',
        'PIL.ImageOps',
        'multipart',
        'inference.captioner',
        'inference.model_manager',
        'inference.preprocessing',
        'security.local_auth',
        'config.settings',
        'api.health',
        'api.status',
        'api.caption',
    ] + llama_hiddenimports,
    hookspath=[],
    hooksconfig={},
    excludes=[
        'torch',
        'torchvision',
        'torchaudio',
        'torchao',
        'tensorflow',
        'keras',
        'transformers',
        'datasets',
        'bitsandbytes',
        'cv2',
        'sklearn',
        'scipy',
        'matplotlib',
        'tkinter',
        'notebook',
        'pandas',
        'pyarrow',
        'numba',
        'llvmlite',
        'h5py',
        'triton',
        'onnxruntime',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='StashLocalAI',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,  # Open standard console window for streaming logs and error visibility
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
