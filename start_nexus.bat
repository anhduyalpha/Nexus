@echo off
setlocal enabledelayedexpansion
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
cd /d "%~dp0"
title NEXUS Smart Home System

echo =========================================================
echo    NEXUS SMART HOME - MASTER SERVER (WINDOWS GPU)
echo =========================================================
echo.

if not exist "%~dp0.venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment .venv not found in %~dp0
    echo Please run:
    echo   uv venv --python 3.12 .venv
    echo   uv pip install -r requirements.txt
    echo   uv pip install --no-deps openwakeword
    pause
    exit /b 1
)

if not exist "%~dp0.env" (
    echo [INFO] Creating .env from .env.example...
    copy "%~dp0.env.example" "%~dp0.env"
    echo [NOTE] Please edit .env with your HA_TOKEN and API Key!
)

echo [INFO] Starting Nexus Master Server...
echo [INFO] Web Dashboard: http://localhost:8080
echo [INFO] Satellite WS:  ws://localhost:8080/ws/satellite
echo.

"%~dp0.venv\Scripts\python.exe" "%~dp0main.py"

pause
