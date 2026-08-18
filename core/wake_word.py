import logging
import numpy as np
from typing import Optional, List
from config import config

logger = logging.getLogger("NexusWakeWord")

class WakeWordDetector:
    """Detects Wake Word ('Hey Nexus' / 'Nexus') using openWakeWord with local CPU inference."""

    def __init__(self, model_name: str = "hey_nexus", threshold: float = 0.5):
        self.model_name = model_name
        self.threshold = threshold
        self.oww_model = None
        self._initialized = False

    def init_model(self):
        """Lazy load openWakeWord model."""
        if self._initialized:
            return

        try:
            import openwakeword
            from openwakeword.model import Model

            # Download default models if needed and load
            try:
                openwakeword.utils.download_models()
            except Exception as e:
                logger.warning(f"Could not auto-download openWakeWord models: {e}")

            # Try to initialize with requested model or all available
            self.oww_model = Model(
                wakeword_models=[self.model_name] if self.model_name else None,
                inference_framework="onnx"
            )
            self._initialized = True
            logger.info(f"Loaded openWakeWord models: {list(self.oww_model.models.keys())}")
        except Exception as e:
            logger.warning(f"Failed to initialize openWakeWord ({e}). Falling back to simulation/energy mode.")
            self.oww_model = None
            self._initialized = True

    def process_chunk(self, audio_chunk_16khz: np.ndarray) -> bool:
        """
        Process a chunk of 16kHz 16-bit PCM audio.
        Returns True if wake word is detected.
        """
        if not self._initialized:
            self.init_model()

        if self.oww_model is None:
            return False

        try:
            # openWakeWord expects 16-bit int PCM audio (numpy array)
            if audio_chunk_16khz.dtype != np.int16:
                audio_chunk_16khz = (audio_chunk_16khz * 32767).astype(np.int16)

            prediction = self.oww_model.predict(audio_chunk_16khz)
            for model_key, score in prediction.items():
                if score >= self.threshold:
                    logger.info(f"Wake word detected! Model: {model_key}, Score: {score:.3f}")
                    return True
        except Exception as e:
            logger.error(f"Error in wake word prediction: {e}")

        return False

    def reset(self):
        """Reset internal model state."""
        if self.oww_model:
            try:
                self.oww_model.reset()
            except Exception:
                pass

wake_word_detector = WakeWordDetector(config.WAKE_WORD_MODEL, config.WAKE_WORD_THRESHOLD)
