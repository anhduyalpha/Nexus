import asyncio
import logging
import threading
import time
import numpy as np
from typing import Dict, Any, List, Optional, Callable
from config import config
from core.sound_effects import sound_effects
from core.wake_word import wake_word_detector
from core.audio_recorder import audio_recorder
from core.stt import stt_engine
from core.brain import nexus_brain
from core.tts import tts_engine

logger = logging.getLogger("NexusOrchestrator")

class PipelineState:
    IDLE = "IDLE"
    LISTENING_WAKE = "LISTENING_WAKE"
    WAKE_DETECTED = "WAKE_DETECTED"
    RECORDING = "RECORDING"
    TRANSCRIBING = "TRANSCRIBING"
    THINKING = "THINKING"
    EXECUTING = "EXECUTING"
    SPEAKING = "SPEAKING"

class VoiceOrchestrator:
    """Coordinates Wake Word, VAD, STT, Gemini Brain, HA Actions, and TTS."""

    def __init__(self):
        self.state = PipelineState.IDLE
        self.is_running = False
        self.is_muted = False
        self._loop_thread = None
        self._subscribers: List[Callable[[Dict[str, Any]], None]] = []

    def register_event_listener(self, callback: Callable[[Dict[str, Any]], None]):
        """Register a callback for WebSocket and UI event notifications."""
        self._subscribers.append(callback)

    def unregister_event_listener(self, callback: Callable[[Dict[str, Any]], None]):
        if callback in self._subscribers:
            self._subscribers.remove(callback)

    def emit_event(self, event_type: str, data: Dict[str, Any]):
        """Broadcast events to Web Dashboard and logs."""
        payload = {
            "type": event_type,
            "state": self.state,
            "timestamp": time.time(),
            "data": data
        }
        for sub in list(self._subscribers):
            try:
                sub(payload)
            except Exception as e:
                logger.error(f"Error notifying subscriber: {e}")

    def set_state(self, new_state: str, details: Optional[Dict[str, Any]] = None):
        self.state = new_state
        self.emit_event("state_change", {"state": new_state, **(details or {})})

    def start(self):
        """Start the background voice loop."""
        if self.is_running:
            return
        self.is_running = True
        self._loop_thread = threading.Thread(target=self._run_voice_loop, daemon=True)
        self._loop_thread.start()
        logger.info("Nexus Voice Orchestrator started.")

    def stop(self):
        """Stop the background voice loop."""
        self.is_running = False
        self.set_state(PipelineState.IDLE)
        logger.info("Nexus Voice Orchestrator stopped.")

    def toggle_mute(self) -> bool:
        """Toggle microphone mute status."""
        self.is_muted = not self.is_muted
        self.emit_event("mute_toggled", {"is_muted": self.is_muted})
        return self.is_muted

    def _run_voice_loop(self):
        """Main listening and processing loop running in background."""
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        # Open audio stream for wake word listening
        stream = audio_recorder.get_input_stream()

        while self.is_running:
            if self.is_muted:
                self.set_state(PipelineState.IDLE, {"message": "Microphone muted"})
                time.sleep(0.5)
                continue

            self.set_state(PipelineState.LISTENING_WAKE)

            try:
                if stream is None:
                    # Retry opening stream or idle
                    time.sleep(1.0)
                    stream = audio_recorder.get_input_stream()
                    continue

                # Read chunk (1280 samples = 80ms at 16kHz)
                raw_data = stream.read(audio_recorder.chunk_size, exception_on_overflow=False)
                chunk_np = np.frombuffer(raw_data, dtype=np.int16)

                # Send small audio level event for visualizer
                rms = float(np.sqrt(np.mean((chunk_np.astype(np.float32) / 32768.0) ** 2)))
                if rms > 0.02:
                    self.emit_event("audio_level", {"rms": rms})

                # Check wake word
                if wake_word_detector.process_chunk(chunk_np):
                    # 1. Wake word detected!
                    self.set_state(PipelineState.WAKE_DETECTED)
                    sound_effects.play_wake()
                    wake_word_detector.reset()

                    # Pause wake stream temporarily during recording & processing
                    stream.stop_stream()

                    # 2. Record user speech command with VAD
                    self.set_state(PipelineState.RECORDING)
                    
                    def on_speech_chunk(chunk):
                        chunk_rms = float(np.sqrt(np.mean((chunk.astype(np.float32) / 32768.0) ** 2)))
                        self.emit_event("audio_level", {"rms": chunk_rms, "is_recording": True})

                    audio_data = audio_recorder.record_phrase_with_vad(
                        max_duration_sec=12.0,
                        silence_limit_sec=config.SILENCE_DURATION_SEC,
                        on_chunk=on_speech_chunk
                    )

                    # 3. Transcribe audio to text
                    self.set_state(PipelineState.TRANSCRIBING)
                    user_text = stt_engine.transcribe(audio_data)
                    self.emit_event("transcription", {"text": user_text})

                    if user_text:
                        # 4. Send to Gemini Brain & Execute Tools
                        self.set_state(PipelineState.THINKING)
                        result = loop.run_until_complete(nexus_brain.process_user_query(user_text))
                        
                        response_text = result.get("response", "")
                        actions = result.get("actions", [])

                        if actions:
                            self.set_state(PipelineState.EXECUTING, {"actions": actions})
                            sound_effects.play_done()

                        self.emit_event("conversation_turn", {
                            "user_text": user_text,
                            "response_text": response_text,
                            "actions": actions
                        })

                        # 5. Speak response via TTS
                        self.set_state(PipelineState.SPEAKING)
                        loop.run_until_complete(tts_engine.speak(response_text))
                    else:
                        logger.info("No speech recognized after wake word.")

                    # Resume wake stream
                    stream.start_stream()

            except Exception as e:
                logger.error(f"Error in voice loop: {e}")
                time.sleep(0.5)

        if stream:
            try:
                stream.stop_stream()
                stream.close()
            except Exception:
                pass

    async def trigger_manual_command(self, text_command: str) -> Dict[str, Any]:
        """Trigger a command directly via text (from Web Dashboard or API)."""
        self.set_state(PipelineState.THINKING)
        sound_effects.play_wake()

        result = await nexus_brain.process_user_query(text_command)
        response_text = result.get("response", "")
        actions = result.get("actions", [])

        if actions:
            self.set_state(PipelineState.EXECUTING, {"actions": actions})
            sound_effects.play_done()

        self.emit_event("conversation_turn", {
            "user_text": text_command,
            "response_text": response_text,
            "actions": actions
        })

        self.set_state(PipelineState.SPEAKING)
        await tts_engine.speak(response_text)

        self.set_state(PipelineState.LISTENING_WAKE)
        return result

    async def process_external_audio(self, audio_data: Any, satellite_name: str = "Linux Satellite") -> Dict[str, Any]:
        """
        Process audio streamed from an external satellite (e.g. Linux Laptop mic).
        Plays chimes and speech through Master's speaker (Windows).
        """
        logger.info(f"Received external audio from {satellite_name}")
        
        # 1. Convert to numpy int16 array if raw bytes or WAV
        if isinstance(audio_data, bytes):
            if audio_data.startswith(b"RIFF"):
                import io
                import soundfile as sf
                try:
                    data_np, _ = sf.read(io.BytesIO(audio_data), dtype="int16")
                    audio_np = data_np
                except Exception:
                    audio_np = np.frombuffer(audio_data[44:], dtype=np.int16)
            else:
                audio_np = np.frombuffer(audio_data, dtype=np.int16)
        elif isinstance(audio_data, np.ndarray):
            audio_np = audio_data
        else:
            return {"error": "Invalid audio data format"}

        # 2. Wake detected sound & state on Master Speaker
        self.set_state(PipelineState.WAKE_DETECTED, {"source": satellite_name})
        sound_effects.play_wake()

        # 3. Transcribe with Whisper (CUDA GPU)
        self.set_state(PipelineState.TRANSCRIBING, {"source": satellite_name})
        user_text = stt_engine.transcribe(audio_np)
        self.emit_event("transcription", {"text": user_text, "source": satellite_name})

        if not user_text:
            logger.info("No speech recognized from external audio.")
            self.set_state(PipelineState.LISTENING_WAKE)
            return {"query": "", "response": "Không nhận diện được giọng nói.", "actions": []}

        # 4. Process with Brain
        self.set_state(PipelineState.THINKING, {"source": satellite_name})
        result = await nexus_brain.process_user_query(user_text)
        response_text = result.get("response", "")
        actions = result.get("actions", [])

        if actions:
            self.set_state(PipelineState.EXECUTING, {"actions": actions, "source": satellite_name})
            sound_effects.play_done()

        self.emit_event("conversation_turn", {
            "user_text": user_text,
            "response_text": response_text,
            "actions": actions,
            "source": satellite_name
        })

        # 5. Speak on Master Speaker
        self.set_state(PipelineState.SPEAKING, {"source": satellite_name})
        await tts_engine.speak(response_text)

        self.set_state(PipelineState.LISTENING_WAKE)
        return result

orchestrator = VoiceOrchestrator()
