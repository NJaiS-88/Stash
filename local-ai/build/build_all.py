"""
Stash Local AI - Build & Packaging Automation Script
1. Compiles standalone StashLocalAI.exe using PyInstaller
2. Compiles Windows installer StashLocalAI-Setup.exe using Inno Setup (ISCC)
3. Copies the installer directly into frontend/public/downloads/ for website distribution
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

BUILD_DIR = Path(__file__).resolve().parent
LOCAL_AI_DIR = BUILD_DIR.parent
PROJECT_ROOT = LOCAL_AI_DIR.parent
FRONTEND_DOWNLOADS_DIR = PROJECT_ROOT / "frontend" / "public" / "downloads"
DIST_DIR = BUILD_DIR / "dist"

# Common Inno Setup paths on Windows
INNO_PATHS = [
    Path(r"C:\Program Files (x86)\Inno Setup 6\ISCC.exe"),
    Path(r"C:\Program Files\Inno Setup 6\ISCC.exe"),
    Path(r"C:\Program Files (x86)\Inno Setup 5\ISCC.exe"),
]


def find_iscc() -> Path | None:
    # Check in PATH
    iscc_in_path = shutil.which("ISCC.exe") or shutil.which("iscc")
    if iscc_in_path:
        return Path(iscc_in_path)
    for p in INNO_PATHS:
        if p.exists():
            return p
    return None


def run_pyinstaller():
    print("--- Step 1: Compiling StashLocalAI.exe with PyInstaller ---")
    spec_path = BUILD_DIR / "StashLocalAI.spec"
    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        str(spec_path),
        "--clean",
        "--noconfirm",
        f"--distpath={DIST_DIR}",
        f"--workpath={BUILD_DIR / 'build'}"
    ]
    print(f"Running command: {' '.join(cmd)}")
    subprocess.run(cmd, cwd=BUILD_DIR, check=True)
    exe_path = DIST_DIR / "StashLocalAI.exe"
    if not exe_path.exists():
        raise FileNotFoundError(f"Expected binary {exe_path} was not produced!")
    print(f"✅ Successfully compiled: {exe_path}")
    return exe_path


def run_inno_setup():
    print("\n--- Step 2: Compiling Windows Installer (StashLocalAI-Setup.exe) ---")
    iscc = find_iscc()
    iss_file = BUILD_DIR / "installer.iss"
    setup_exe = DIST_DIR / "StashLocalAI-Setup.exe"

    if iscc:
        print(f"Found Inno Setup Compiler at: {iscc}")
        subprocess.run([str(iscc), str(iss_file)], cwd=BUILD_DIR, check=True)
        print(f"✅ Successfully compiled: {setup_exe}")
    else:
        print("⚠️ Inno Setup (ISCC.exe) not found in standard paths.")
        print("Creating standalone distribution executable in dist/StashLocalAI-Setup.exe...")
        # Fallback: copy standalone exe as setup binary for direct distribution
        shutil.copy2(DIST_DIR / "StashLocalAI.exe", setup_exe)

    return setup_exe


def copy_to_frontend(setup_exe: Path):
    print("\n--- Step 3: Copying Installer to Frontend Public Downloads ---")
    FRONTEND_DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
    target = FRONTEND_DOWNLOADS_DIR / "StashLocalAI-Setup.exe"
    shutil.copy2(setup_exe, target)
    print(f"✅ Published installer to website download endpoint: {target}")


def main():
    print("==================================================")
    print("    Building Stash Local AI Windows Distribution  ")
    print("==================================================")
    try:
        run_pyinstaller()
        setup_exe = run_inno_setup()
        copy_to_frontend(setup_exe)
        print("\n🎉 Build Complete! The deployed website can now serve the installer directly.")
    except Exception as e:
        print(f"\n❌ Build process encountered an error: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
