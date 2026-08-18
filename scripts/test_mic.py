#!/usr/bin/env python3
"""
NEXUS SMART HOME - STANDALONE MICROPHONE & STT DIAGNOSTIC TOOL
==============================================================
Runs on Windows or Linux to test physical microphone hardware,
volume level metering, and Faster-Whisper GPU/CPU transcription.
"""

import sys
import time
import io
import wave
import numpy as np
from pathlib import Path

# Add project root to sys.path
PROJECT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_DIR))

from config import config

def list_audio_devices():
    """List all available microphone input devices."""
    try:
        import pyaudio
        pa = pyaudio.PyAudio()
        print("\n" + "="*65)
        print(" 🎙️  DANH SÁCH MICROPHONE TÌM THẤY TRÊN HỆ THỐNG:")
        print("="*65)
        input_devices = []
        for i in range(pa.get_device_count()):
            dev = pa.get_device_info_by_index(i)
            if dev.get("maxInputChannels", 0) > 0:
                input_devices.append(dev)
                print(f" [{dev['index']}] {dev['name']} (Channels: {dev['maxInputChannels']}, Rate: {int(dev['defaultSampleRate'])}Hz)")
        print("="*65 + "\n")
        pa.terminate()
        return input_devices
    except Exception as e:
        print(f"[!] Không thể liệt kê thiết bị bằng PyAudio: {e}")
        return []

def draw_vu_meter(rms: float, bar_len: int = 30) -> str:
    """Generate ASCII VU Volume Meter bar."""
    pct = min(1.0, rms * 5.0)  # Scale up for visibility
    filled = int(pct * bar_len)
    bar = "█" * filled + "░" * (bar_len - filled)
    pct_str = f"{int(pct * 100):3d}%"
    return f"[{bar}] {pct_str}"

def test_microphone(device_index: int = None, duration_sec: float = 5.0):
    """Record audio and test live VU meter + Faster-Whisper transcription."""
    import pyaudio
    pa = pyaudio.PyAudio()

    sample_rate = config.SAMPLE_RATE
    chunk_size = 1024

    try:
        stream = pa.open(
            format=pyaudio.paInt16,
            channels=1,
            rate=sample_rate,
            input=True,
            input_device_index=device_index,
            frames_per_buffer=chunk_size
        )
    except Exception as e:
        print(f"[ERROR] Không thể mở Microphone (Index={device_index}): {e}")
        pa.terminate()
        return

    print(f"[*] Đang lắng nghe Micro (Hãy nói thử một câu trong {duration_sec} giây)...")
    print("    Ví dụ: 'Nexus, bật đèn phòng khách' hoặc 'Nhiệt độ hiện tại bao nhiêu'\n")

    frames = []
    start_time = time.time()

    try:
        while (time.time() - start_time) < duration_sec:
            data = stream.read(chunk_size, exception_on_overflow=False)
            chunk_np = np.frombuffer(data, dtype=np.int16)
            frames.append(chunk_np)

            # Calculate RMS
            audio_float = chunk_np.astype(np.float32) / 32768.0
            rms = float(np.sqrt(np.mean(audio_float ** 2)))
            vu_str = draw_vu_meter(rms)
            time_left = max(0.0, duration_sec - (time.time() - start_time))
            print(f"\r  LIVE LEVEL: {vu_str} | Còn lại: {time_left:.1f}s ", end="", flush=True)
            time.sleep(0.01)
    finally:
        print("\n\n[*] Đã thu âm xong đoạn mẫu!")
        stream.stop_stream()
        stream.close()
        pa.terminate()

    if not frames:
        print("[!] Không thu được dữ liệu âm thanh.")
        return

    audio_data = np.concatenate(frames)

    # Test Faster-Whisper GPU/CPU Transcription
    print("[*] Đang nạp Faster-Whisper để nhận diện giọng nói...")
    try:
        from core.stt import stt_engine
        stt_engine.init_model()
        print("[*] Đang giải mã âm thanh bằng AI...")
        text = stt_engine.transcribe(audio_data, sample_rate=sample_rate)
        
        print("\n" + "="*65)
        print(" 📝  KẾT QUẢ WHISPER GPU/CPU NHẬN DIỆN ĐƯỢC:")
        print("="*65)
        if text:
            print(f" 👉 \"{text}\"")
        else:
            print(" [!] Không nhận diện được từ ngữ (âm lượng quá nhỏ hoặc không có tiếng nói).")
        print("="*65 + "\n")
    except Exception as e:
        print(f"[!] Lỗi trong quá trình chạy STT: {e}")

def main():
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    print("="*65)
    print(" 🛠️  NEXUS SMART HOME - CÔNG CỤ TEST MICROPHONE & STT")
    print("="*65)

    devices = list_audio_devices()
    
    test_microphone(duration_sec=5.0)

if __name__ == "__main__":
    main()
