@echo off
setlocal enabledelayedexpansion
set PYTHONIOENCODING=utf-8
set PYTHONUTF8=1
cd /d "%~dp0.."
title NEXUS - Xiaomi USB Microphone Satellite

echo =========================================================
echo    📱 NEXUS - XIAOMI PHONE USB MICROPHONE SATELLITE
echo =========================================================
echo.

if not exist ".venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment .venv not found!
    pause
    exit /b 1
)

echo [1/3] Checking ADB USB connection with Xiaomi phone...
adb devices
echo.

echo [2/3] Connecting to Master at ws://localhost:8080/ws/satellite...
echo [3/3] Activating Dual-Mic Noise Filter + Peak Normalizer (95%%)...
echo.

".venv\Scripts\python.exe" "scripts/xiaomi_satellite.py" --server "ws://localhost:8080/ws/satellite" --name "Xiaomi Redmi Note 8 Pro (USB)" --threshold 0.10 --gain 10.0

pause
