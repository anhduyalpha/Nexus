import math
import struct
import wave
from pathlib import Path
import sys

# Ensure root is in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from config import config, SOUNDS_DIR

def create_sine_wave(freq, duration, sample_rate=44100, amplitude=0.5, fade_in=0.02, fade_out=0.05):
    """Generate audio samples for a smooth sine wave with fade in/out envelope."""
    n_samples = int(sample_rate * duration)
    fade_in_samples = int(sample_rate * fade_in)
    fade_out_samples = int(sample_rate * fade_out)
    
    samples = []
    for i in range(n_samples):
        # Envelope calculation
        env = 1.0
        if i < fade_in_samples:
            env = i / fade_in_samples
        elif i > n_samples - fade_out_samples:
            env = (n_samples - i) / fade_out_samples
            
        t = i / sample_rate
        val = amplitude * env * math.sin(2 * math.pi * freq * t)
        samples.append(val)
    return samples

def save_wav(filepath: Path, samples, sample_rate=44100):
    """Save audio samples (float between -1 and 1) to a 16-bit PCM WAV file."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(filepath), 'wb') as wav_file:
        wav_file.setnchannels(1)  # Mono
        wav_file.setsampwidth(2)  # 16-bit
        wav_file.setframerate(sample_rate)
        
        packed_data = bytearray()
        for s in samples:
            # Clamp to -1.0 .. 1.0
            clamped = max(-1.0, min(1.0, s))
            int_val = int(clamped * 32767.0)
            packed_data.extend(struct.pack('<h', int_val))
            
        wav_file.writeframes(packed_data)
    print(f"Generated sound: {filepath.name}")

def generate_wake_chime():
    """Iron Man style energetic dual harmonic rising beep."""
    sr = 44100
    # Two crisp pulses: pulse 1 (880Hz A5), pulse 2 (1760Hz A6)
    p1 = create_sine_wave(880, 0.08, sr, amplitude=0.6, fade_in=0.01, fade_out=0.02)
    # Add slight 2nd harmonic
    h1 = create_sine_wave(1760, 0.08, sr, amplitude=0.2, fade_in=0.01, fade_out=0.02)
    tone1 = [a + b for a, b in zip(p1, h1)]
    
    gap = [0.0] * int(sr * 0.03)
    
    p2 = create_sine_wave(1318.5, 0.15, sr, amplitude=0.7, fade_in=0.01, fade_out=0.08)
    h2 = create_sine_wave(2637, 0.15, sr, amplitude=0.25, fade_in=0.01, fade_out=0.08)
    tone2 = [a + b for a, b in zip(p2, h2)]
    
    combined = tone1 + gap + tone2
    save_wav(config.WAKE_SOUND, combined, sr)

def generate_done_chime():
    """Smooth confirmation tone (A subtle descending and resolving chime)."""
    sr = 44100
    p1 = create_sine_wave(1046.5, 0.07, sr, amplitude=0.5, fade_in=0.01, fade_out=0.02)
    gap = [0.0] * int(sr * 0.02)
    p2 = create_sine_wave(1567.98, 0.18, sr, amplitude=0.6, fade_in=0.01, fade_out=0.1)
    combined = p1 + gap + p2
    save_wav(config.DONE_SOUND, combined, sr)

def generate_ready_chime():
    """Brief single high-tech ping."""
    sr = 44100
    p = create_sine_wave(1200, 0.09, sr, amplitude=0.5, fade_in=0.005, fade_out=0.05)
    save_wav(config.READY_SOUND, p, sr)

def generate_error_chime():
    """Low pitched soft double warning tone."""
    sr = 44100
    p1 = create_sine_wave(350, 0.1, sr, amplitude=0.5, fade_in=0.01, fade_out=0.03)
    gap = [0.0] * int(sr * 0.04)
    p2 = create_sine_wave(280, 0.15, sr, amplitude=0.5, fade_in=0.01, fade_out=0.08)
    combined = p1 + gap + p2
    save_wav(config.ERROR_SOUND, combined, sr)

def generate_all():
    print("Generating Nexus sound effects...")
    generate_wake_chime()
    generate_done_chime()
    generate_ready_chime()
    generate_error_chime()
    print("All audio chimes generated successfully!")

if __name__ == "__main__":
    generate_all()
