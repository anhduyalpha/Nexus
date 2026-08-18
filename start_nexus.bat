@echo off
title NEXUS AI Smart Home Intelligence System
chcp 65001 >nul
cd /d "%~dp0"

echo =====================================================================
echo  🤖 KHỞI ĐỘNG NEXUS AI SMART HOME (WINDOWS GPU / CUDA EDITION)
echo =====================================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Chua tim thay moi truong ao .venv!
    echo Vui long khoi tao bang uv hoac chay:
    echo   uv venv --python 3.12 .venv
    echo   uv pip install -r requirements.txt
    pause
    exit /b 1
)

if not exist ".env" (
    echo [INFO] Tao file .env tu .env.example...
    copy .env.example .env
    echo [NOTE] Vui long mo file .env de dien Token Home Assistant va API Key!
)

echo [INFO] Dang khoi chay Nexus Voice & Web HUD Server...
echo 👉 Truy cap Dashboard tai: http://localhost:8080
echo.

".venv\Scripts\python.exe" main.py

pause
