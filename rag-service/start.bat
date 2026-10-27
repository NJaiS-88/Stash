@echo off
title Stash RAG Service (FastAPI + LangChain)
cd /d "%~dp0"
echo ========================================================
echo   Starting Stash RAG & Text Embedding Service
echo ========================================================
python -m pip install -r requirements.txt
python run.py
pause
