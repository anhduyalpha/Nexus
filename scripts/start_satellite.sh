#!/usr/bin/env bash
# ==============================================================================
# NEXUS SATELLITE - 1-CLICK LAUNCH SCRIPT (MAXIMUM VOLUME & PEAK NORMALIZATION)
# ==============================================================================

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENV_DIR="$PROJECT_DIR/.venv"

if [ ! -d "$VENV_DIR" ]; then
    echo "[ERROR] Virtual environment $VENV_DIR not found!"
    echo "Please run ./scripts/install_ubuntu.sh first."
    exit 1
fi

source "$VENV_DIR/bin/activate"

# 1. Kích hoạt toàn bộ cổng Micro và đẩy âm lượng phần cứng ALSA lên 100%
if command -v amixer >/dev/null 2>&1; then
    amixer set Capture cap 100%+ unmute >/dev/null 2>&1 || true
    amixer set Mic 100%+ unmute >/dev/null 2>&1 || true
    amixer set 'Internal Mic' 100%+ unmute >/dev/null 2>&1 || true
    amixer set 'Front Mic' 100%+ unmute >/dev/null 2>&1 || true
    amixer set 'Rear Mic' 100%+ unmute >/dev/null 2>&1 || true
    amixer set 'Mic Boost' 100%+ >/dev/null 2>&1 || true
    amixer set 'Internal Mic Boost' 100%+ >/dev/null 2>&1 || true
    amixer set 'Front Mic Boost' 100%+ >/dev/null 2>&1 || true
    amixer set 'Capture Boost' 100%+ >/dev/null 2>&1 || true
    amixer set 'Digital' 100%+ unmute >/dev/null 2>&1 || true
    
    # Quét mở âm lượng cho từng card âm thanh 0, 1, 2, 3
    for c in 0 1 2 3; do
        amixer -c $c set Capture cap 100%+ unmute >/dev/null 2>&1 || true
        amixer -c $c set Mic 100%+ unmute >/dev/null 2>&1 || true
        amixer -c $c set 'Mic Boost' 100%+ >/dev/null 2>&1 || true
        amixer -c $c set 'Internal Mic Boost' 100%+ >/dev/null 2>&1 || true
        amixer -c $c set 'Front Mic Boost' 100%+ >/dev/null 2>&1 || true
    done
fi

# 2. Đẩy âm lượng PulseAudio / PipeWire lên kịch khung 150%
if command -v pactl >/dev/null 2>&1; then
    pactl set-source-volume @DEFAULT_SOURCE@ 150% >/dev/null 2>&1 || true
    pactl set-source-mute @DEFAULT_SOURCE@ 0 >/dev/null 2>&1 || true
fi

# Nhận tham số truyền vào
SERVER_URL="${1:-${SATELLITE_SERVER_URL:-ws://192.168.1.100:8080/ws/satellite}}"
SATELLITE_NAME="${2:-${SATELLITE_NAME:-Linux Laptop Mic}}"
GAIN="${3:-${AUDIO_GAIN:-12.0}}"
THRESHOLD="${4:-${WAKE_WORD_THRESHOLD:-0.10}}"
DEVICE="${5}"

echo "=========================================================="
echo " 🎙️ STARTING NEXUS MICROPHONE SATELLITE (LINUX)"
echo " Master Server:        $SERVER_URL"
echo " Satellite Name:       $SATELLITE_NAME"
echo " Pre-Amp Boost:        ${GAIN}x (Dynamic Peak Normalizer to 95%)"
echo " Wake Sensitivity:     $THRESHOLD (ULTRA SENSITIVE)"
if [ -n "$DEVICE" ]; then
    echo " Target Device Index:  [$DEVICE]"
fi
echo "=========================================================="

CMD="python3 \"$PROJECT_DIR/satellite.py\" --server \"$SERVER_URL\" --name \"$SATELLITE_NAME\" --gain \"$GAIN\" --threshold \"$THRESHOLD\""
if [ -n "$DEVICE" ]; then
    CMD="$CMD --device $DEVICE"
fi

eval $CMD
