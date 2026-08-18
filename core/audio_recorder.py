import time
import logging
import asyncio
import numpy as np
from typing import Optional, Callable
from config import config

logger = logging.getLogger("NexusAudioRecorder")

class AudioRecorder:
    """Manages microphone audio input, streaming chunks and recording with VAD."""

    def __init__(self, sample_rate: int = 16000, chunk_size: int = 1280):
        self.sample_rate = sample_rate
        self.chunk_size = chunk_size  # 80ms at 16kHz
        self._stream = None
        self._pa = None
        self._is_recording = False
        self._vad_model = None
        self._init_vad()

    def _init_vad(self):
        """Initialize Silero VAD model if available."""
        try:
            import torch
            model, utils = torch.hub.load(
                repo_or_dir='snakers4/silero-vad',
                model='silero_vad',
                force_reload=False,
                onnx=True
            )
            self._vad_model = model
            logger.info("Silero VAD initialized successfully.")
        except Exception as e:
            logger.info(f"Using energy-based VAD fallback ({e})")
            self._vad_model = None

    def is_speech(self, audio_chunk: np.ndarray, threshold: float = 0.5) -> bool:
        """Determine whether an audio chunk contains human voice."""
        if audio_chunk.size == 0:
            return False

        # If Silero VAD is available
        if self._vad_model is not None:
            try:
                import torch
                # Convert to float32 normalized tensor
                if audio_chunk.dtype == np.int16:
                    audio_float = audio_chunk.astype(np.float32) / 32768.0
                else:
                    audio_float = audio_chunk.astype(np.float32)
                tensor = torch.from_numpy(audio_float)
                prob = self._vad_model(tensor, self.sample_rate).item()
                return prob >= threshold
            except Exception:
                pass

        # Energy-based fallback
        if audio_chunk.dtype == np.int16:
            audio_float = audio_chunk.astype(np.float32) / 32768.0
        else:
            audio_float = audio_chunk.astype(np.float32)
        rms = np.sqrt(np.mean(audio_float ** 2))
        return rms > 0.015  # Energy threshold

    def get_input_stream(self):
        """Open PyAudio or sounddevice input stream."""
        try:
            import pyaudio
            if self._pa is None:
                self._pa = pyaudio.PyAudio()
            return self._pa.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                input=True,
                frames_per_buffer=self.chunk_size
            )
        except Exception as e:
            logger.warning(f"Could not open PyAudio stream: {e}. Fallback to simulated audio.")
            return None

    def record_phrase_with_vad(
        self,
        max_duration_sec: float = 12.0,
        silence_limit_sec: Optional[float] = None,
        on_chunk: Optional[Callable[[np.ndarray], None]] = None
    ) -> np.ndarray:
        """
        Record audio continuously from microphone until user stops speaking (silence detected)
        or max_duration_sec is reached.
        """
        silence_limit = silence_limit_sec or config.SILENCE_DURATION_SEC
        stream = self.get_input_stream()
        if stream is None:
            # Simulate silence or return empty buffer if no physical microphone attached
            time.sleep(1.0)
            return np.zeros(self.sample_rate * 2, dtype=np.int16)

        frames = []
        has_speech_started = False
        silence_start_time = None
        start_time = time.time()

        try:
            while (time.time() - start_time) < max_duration_sec:
                data = stream.read(self.chunk_size, exception_on_overflow=False)
                chunk_np = np.frombuffer(data, dtype=np.int16)
                frames.append(chunk_np)

                if on_chunk:
                    on_chunk(chunk_np)

                speech_detected = self.is_speech(chunk_np)

                if speech_detected:
                    has_speech_started = True
                    silence_start_time = None
                elif has_speech_started:
                    # User was speaking, now is silent
                    if silence_start_time is None:
                        silence_start_time = time.time()
                    elif (time.time() - silence_start_time) >= silence_limit:
                        logger.info(f"VAD: User finished speaking (silence {silence_limit}s reached).")
                        break
        finally:
            stream.stop_stream()
            stream.close()

        if frames:
            return np.concatenate(frames)
        return np.array([], dtype=np.int16)

audio_recorder = AudioRecorder(sample_rate=config.SAMPLE_RATE)
