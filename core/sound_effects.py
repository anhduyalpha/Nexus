import os
import threading
import wave
import numpy as np
from pathlib import Path
from config import config

class SoundEffects:
    """Manages playing Nexus sound effects without blocking the main event loop."""

    @staticmethod
    def play_wav_file(filepath: Path):
        """Play a WAV file in a background thread."""
        if not filepath.exists():
            # Try to auto-generate if missing
            try:
                from scripts.generate_chimes import generate_all
                generate_all()
            except Exception as e:
                print(f"[SoundEffects] Could not generate chimes: {e}")
                return

        def _play():
            try:
                import sounddevice as sd
                with wave.open(str(filepath), 'rb') as wf:
                    sr = wf.getframerate()
                    n_frames = wf.getnframes()
                    audio_data = wf.readframes(n_frames)
                    audio_np = np.frombuffer(audio_data, dtype=np.int16)
                    sd.play(audio_np, samplerate=sr)
                    sd.wait()
            except Exception as e:
                # Fallback to system aplay / paplay if sounddevice is not available
                try:
                    os.system(f"aplay -q '{filepath}' 2>/dev/null || paplay '{filepath}' 2>/dev/null")
                except Exception:
                    pass

        threading.Thread(target=_play, daemon=True).start()

    @classmethod
    def play_wake(cls):
        """Play Nexus wake detection chime."""
        cls.play_wav_file(config.WAKE_SOUND)

    @classmethod
    def play_ready(cls):
        """Play Nexus ready listening tone."""
        cls.play_wav_file(config.READY_SOUND)

    @classmethod
    def play_done(cls):
        """Play Nexus action completed confirmation chime."""
        cls.play_wav_file(config.DONE_SOUND)

    @classmethod
    def play_error(cls):
        """Play error alert chime."""
        cls.play_wav_file(config.ERROR_SOUND)

sound_effects = SoundEffects()
