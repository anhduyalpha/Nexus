#!/usr/bin/env bash
# ==============================================================================
# NEXUS SMART HOME - UBUNTU LINUX SERVER INSTALLATION SCRIPT
# ==============================================================================

set -e

echo "=========================================================="
echo " 🤖 INSTALLING NEXUS SMART HOME DEPENDENCIES ON UBUNTU"
echo "=========================================================="

# 1. Update APT and install system audio/build packages
echo "[1/4] Updating system packages & installing audio libraries..."
sudo apt update
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    portaudio19-dev \
    libasound2-dev \
    ffmpeg \
    alsa-utils \
    mpv \
    curl \
    git

# 2. Setup Python Virtual Environment
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"

echo "[2/4] Setting up Python virtual environment in $VENV_DIR..."
if [ ! -d "$VENV_DIR" ]; then
    python3 -m venv "$VENV_DIR"
fi

source "$VENV_DIR/bin/activate"

# 3. Upgrade pip and install requirements
echo "[3/4] Installing Python requirements..."
pip install --upgrade pip setuptools wheel
pip install -r "$PROJECT_DIR/requirements.txt"

# 4. Generate Chimes and Initialize .env
echo "[4/4] Generating Nexus sound effects and preparing .env..."
if [ ! -f "$PROJECT_DIR/.env" ]; then
    cp "$PROJECT_DIR/.env.example" "$PROJECT_DIR/.env"
    echo "Created .env from .env.example. Please edit .env with your Home Assistant Token & Gemini Key!"
fi

python3 "$PROJECT_DIR/scripts/generate_chimes.py"

echo "=========================================================="
echo " ✅ NEXUS INSTALLATION COMPLETE!"
echo ""
echo " To start Nexus manually:"
echo "   source .venv/bin/activate"
echo "   python main.py"
echo ""
echo " To configure as a background Systemd service:"
echo "   sudo cp service/nexus.service /etc/systemd/system/"
echo "   sudo systemctl daemon-reload"
echo "   sudo systemctl enable --now nexus"
echo "=========================================================="
