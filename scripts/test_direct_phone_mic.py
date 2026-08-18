import subprocess
import shutil
import numpy as np
import io
import time
import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
import soundfile as sf
from core.stt import SpeechToText

def test_stream():
    scrcpy = shutil.which('scrcpy')
    if not scrcpy:
        print("ERROR: scrcpy not found in PATH!")
        return

    cmd = [
        scrcpy,
        '--no-video',
        '--audio-source=mic',
        '--audio-codec=raw',
        '--no-audio-playback',
        '--record=-',
        '--record-format=wav'
    ]

    print("[INFO] Connecting directly to Xiaomi Phone Hardware Mic via ADB scrcpy...")
    proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    # Read 44-byte WAV header
    header = proc.stdout.read(44)
    print(f"WAV Header received: {len(header)} bytes")

    print(">>> SPEAK INTO YOUR XIAOMI PHONE NOW (3 seconds)... <<<")
    chunks = []
    for i in range(30):
        data = proc.stdout.read(9600) # ~0.1s chunk at 48000Hz 16-bit
        if not data:
            break
        # Align to 2 bytes
        if len(data) % 2 != 0:
            data = data[:len(data) - 1]
        pcm = np.frombuffer(data, dtype=np.int16)
        if pcm.size > 0:
            rms = float(np.sqrt(np.mean(pcm.astype(np.float32)**2)))
            print(f"[{i+1}/30] Phone Hardware Mic RMS: {rms:.1f}")
            chunks.append(pcm)

    proc.terminate()
    if chunks:
        all_pcm = np.concatenate(chunks)
        print(f"Total Captured Samples from Xiaomi Phone: {len(all_pcm)}")
        stt = SpeechToText()
        text = stt.transcribe(all_pcm, sample_rate=48000)
        print(f"Faster-Whisper GPU Transcribed Result: '{text}'")

if __name__ == "__main__":
    test_stream()
