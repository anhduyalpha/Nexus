import logging
import io
import wave
import numpy as np
from typing import Optional
from config import config

logger = logging.getLogger("NexusSTT")

class SpeechToText:
    """Offline / Local Speech-To-Text engine using faster-whisper on CPU."""

    def __init__(
        self,
        model_size: str = "base",
        device: str = "cpu",
        compute_type: str = "int8",
        language: str = "vi"
    ):
        self.model_size = model_size or config.WHISPER_MODEL_SIZE
        self.device = device or config.WHISPER_DEVICE
        self.compute_type = compute_type or config.WHISPER_COMPUTE_TYPE
        self.language = language or config.STT_LANGUAGE
        self.model = None
        self._initialized = False

    def init_model(self):
        """Lazy load Faster Whisper model with CUDA GPU auto-detection."""
        if self._initialized:
            return

        from faster_whisper import WhisperModel
        target_device = (self.device or "auto").lower()

        # 1. Attempt GPU CUDA loading if requested or auto
        if target_device in ("cuda", "auto", "gpu"):
            try:
                compute = self.compute_type if self.compute_type not in ("int8", "default") else "float16"
                logger.info(f"Attempting to load faster-whisper on NVIDIA GPU (CUDA, {self.model_size}, {compute})...")
                self.model = WhisperModel(
                    self.model_size,
                    device="cuda",
                    compute_type=compute
                )
                self._initialized = True
                logger.info("🚀 faster-whisper loaded successfully on NVIDIA GPU (CUDA)!")
                return
            except Exception as e:
                logger.info(f"CUDA initialization skipped or not available ({e}). Falling back to CPU...")

        # 2. CPU fallback
        try:
            logger.info(f"Loading faster-whisper on CPU ({self.model_size}, int8)...")
            self.model = WhisperModel(
                self.model_size,
                device="cpu",
                compute_type="int8"
            )
            self._initialized = True
            logger.info("faster-whisper model loaded successfully on CPU!")
        except Exception as e:
            logger.error(f"Failed to load faster-whisper: {e}")
            self.model = None
            self._initialized = True

    def transcribe(self, audio_data: np.ndarray, sample_rate: int = 16000) -> str:
        """
        Transcribe 16-bit PCM numpy array audio data to text.
        """
        if not self._initialized:
            self.init_model()

        if self.model is None or audio_data.size == 0:
            return ""

        try:
            # Convert 16-bit int PCM to normalized float32
            if audio_data.dtype == np.int16:
                audio_float = audio_data.astype(np.float32) / 32768.0
            else:
                audio_float = audio_data.astype(np.float32)

            # Smart home prompt bias to improve accuracy for common command words
            initial_prompt = "Nexus, bật đèn, tắt quạt, nhiệt độ, phòng khách, phòng ngủ, điều hòa, đóng rèm, mở cửa, kịch bản, âm lượng, bài hát."

            segments, info = self.model.transcribe(
                audio_float,
                language=self.language if self.language != "auto" else None,
                initial_prompt=initial_prompt,
                beam_size=1,
                best_of=1,
                temperature=0.0,
                without_timestamps=True,
                vad_filter=True,
                vad_parameters=dict(min_silence_duration_ms=250)
            )

            text_parts = [segment.text.strip() for segment in segments]
            full_text = " ".join(text_parts).strip()
            logger.info(f"STT Result (lang={info.language}, prob={info.language_probability:.2f}): '{full_text}'")
            return full_text
        except Exception as e:
            logger.error(f"Error during transcription: {e}")
            return ""

stt_engine = SpeechToText()
