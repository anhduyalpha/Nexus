#!/usr/bin/env bash
# ==============================================================================
# NEXUS SATELLITE - 1-CLICK LAUNCH SCRIPT FOR LINUX
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "[ERROR] Virtual environment $VENV_DIR not found!"
    echo "Please run ./scripts/install_ubuntu.sh first."
    exit 1
fi

source "$VENV_DIR/bin/activate"

# Allow passing server URL as first argument or environment variable
SERVER_URL="${1:-${SATELLITE_SERVER_URL:-ws://192.168.1.100:8080/ws/satellite}}"
SATELLITE_NAME="${2:-${SATELLITE_NAME:-Linux Laptop Mic}}"

echo "=========================================================="
echo " 🎙️ STARTING NEXUS MICROPHONE SATELLITE (LINUX)"
echo " Connecting to Master: $SERVER_URL"
echo " Satellite Name:       $SATELLITE_NAME"
echo "=========================================================="

python3 "$PROJECT_DIR/satellite.py" --server "$SERVER_URL" --name "$SATELLITE_NAME"
