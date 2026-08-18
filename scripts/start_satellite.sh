#!/usr/bin/env bash
# ==============================================================================
# NEXUS SATELLITE - 1-CLICK LAUNCH SCRIPT FOR LINUX (MAX SENSITIVITY MODE)
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "[ERROR] Virtual environment $VENV_DIR not found!"
    echo "Please run ./scripts/install_ubuntu.sh first."
    exit 1
fi

source "$VENV_DIR/bin/activate"

# 1. Boost all ALSA soundcards & capture channels to 100%
if command -v amixer >/dev/null 2>&1; then
    amixer set Capture 100%+ unmute >/dev/null 2>&1 || true
    amixer set Mic 100%+ unmute >/dev/null 2>&1 || true
    amixer set 'Internal Mic' 100%+ unmute >/dev/null 2>&1 || true
    amixer set 'Mic Boost' 100%+ >/dev/null 2>&1 || true
    amixer set 'Internal Mic Boost' 100%+ >/dev/null 2>&1 || true
    amixer set 'Capture Boost' 100%+ >/dev/null 2>&1 || true
    amixer set 'Digital' 100%+ unmute >/dev/null 2>&1 || true
    for card in 0 1 2 3; do
        amixer -c $card set Capture 100%+ unmute >/dev/null 2>&1 || true
        amixer -c $card set 'Mic Boost' 100%+ >/dev/null 2>&1 || true
    done
fi

# 2. Boost PulseAudio / PipeWire capture volume to 150%
if command -v pactl >/dev/null 2>&1; then
    pactl set-source-volume @DEFAULT_SOURCE@ 150% >/dev/null 2>&1 || true
    pactl set-source-mute @DEFAULT_SOURCE@ 0 >/dev/null 2>&1 || true
fi

# Allow passing arguments
SERVER_URL="${1:-${SATELLITE_SERVER_URL:-ws://192.168.1.100:8080/ws/satellite}}"
SATELLITE_NAME="${2:-${SATELLITE_NAME:-Linux Laptop Mic}}"
GAIN="${3:-${AUDIO_GAIN:-8.0}}"
THRESHOLD="${4:-${WAKE_WORD_THRESHOLD:-0.15}}"
DEVICE="${5}"

echo "=========================================================="
echo " 🎙️ STARTING NEXUS MICROPHONE SATELLITE (LINUX)"
echo " Connecting to Master: $SERVER_URL"
echo " Satellite Name:       $SATELLITE_NAME"
echo " Pre-Amp Gain:         ${GAIN}x (Super Boost)"
echo " Wake Sensitivity:     $THRESHOLD (MAXIMUM SENSITIVITY)"
echo "=========================================================="

CMD="python3 \"$PROJECT_DIR/satellite.py\" --server \"$SERVER_URL\" --name \"$SATELLITE_NAME\" --gain \"$GAIN\" --threshold \"$THRESHOLD\""
if [ -n "$DEVICE" ]; then
    CMD="$CMD --device $DEVICE"
fi

eval $CMD
