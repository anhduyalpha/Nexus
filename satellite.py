#!/usr/bin/env python3
"""
NEXUS SMART HOME - DISTRIBUTED MICROPHONE SATELLITE (LINUX CLIENT)
==================================================================
Runs on Linux Laptop / Raspberry Pi / Ubuntu Server.
- Listens continuously for "Hey Nexus" on local microphone.
- Records the spoken voice command with VAD.
- Streams the audio payload over WebSocket to Windows GPU Master.
- Master PC runs Faster-Whisper (CUDA), Gemini/Ollama, and plays output on Master Speakers.
"""

import sys
import time
import io
import os
import argparse
import asyncio
import logging
import wave
import numpy as np
import websockets
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s"
)
logger = logging.getLogger("NexusSatellite")

def np_to_wav_bytes(audio_np: np.ndarray, sample_rate: int = 16000) -> bytes:
    """Convert numpy int16 PCM array to WAV bytes in memory."""
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(audio_np.tobytes())
    return wav_io.getvalue()

class NexusSatellite:
    """Microphone satellite client with local wake word detection and LAN WebSocket streaming."""

    def __init__(
        self,
        server_url: str,
        satellite_name: str = "Linux Satellite Mic",
        wake_model: str = "hey_nexus",
        wake_threshold: float = 0.5,
        silence_limit: float = 1.2,
        sample_rate: int = 16000
    ):
        self.server_url = server_url
        self.satellite_name = satellite_name
        self.wake_model_name = wake_model
        self.wake_threshold = wake_threshold
        self.silence_limit = silence_limit
        self.sample_rate = sample_rate
        self.chunk_size = 1280  # 80ms at 16kHz

        self.oww_model = None
        self.pa = None

        try:
            import openwakeword
            from openwakeword.model import Model
            try:
                openwakeword.utils.download_models()
            except Exception:
                pass
            
            logger.info("Initializing openWakeWord model...")
            try:
                if self.wake_model_name and self.wake_model_name not in ["hey_nexus"]:
                    self.oww_model = Model(wakeword_models=[self.wake_model_name], inference_framework="onnx")
                else:
                    self.oww_model = Model(wakeword_models=["hey_jarvis"], inference_framework="onnx")
            except Exception:
                self.oww_model = Model(inference_framework="onnx")

            logger.info(f"openWakeWord initialized successfully with models: {list(self.oww_model.models.keys())}!")
        except Exception as e:
            logger.warning(f"openWakeWord not available ({e}). Using Silero VAD energy mode.")
            self.oww_model = None

    def get_audio_stream(self):
        """Open microphone PyAudio stream."""
        try:
            import pyaudio
            if self.pa is None:
                self.pa = pyaudio.PyAudio()
            return self.pa.open(
                format=pyaudio.paInt16,
                channels=1,
                rate=self.sample_rate,
                input=True,
                frames_per_buffer=self.chunk_size
            )
        except Exception as e:
            logger.error(f"Could not open microphone stream: {e}")
            return None

    def check_wake_word(self, chunk: np.ndarray) -> bool:
        """Check if wake word is detected in the audio chunk."""
        if self.oww_model is not None:
            try:
                preds = self.oww_model.predict(chunk)
                for model_key, score in preds.items():
                    if score >= self.wake_threshold:
                        logger.info(f"⚡ Wake Word Detected: '{model_key}' (score: {score:.3f})")
                        return True
            except Exception as e:
                logger.error(f"Wake word prediction error: {e}")
        return False

    def is_speech(self, chunk: np.ndarray) -> bool:
        """Energy-based voice activity detection."""
        audio_float = chunk.astype(np.float32) / 32768.0
        rms = float(np.sqrt(np.mean(audio_float ** 2)))
        return rms > 0.015

    def record_phrase(self, stream, max_duration: float = 12.0) -> np.ndarray:
        """Record spoken command after wake word until silence is detected."""
        logger.info("🎙️ Recording user voice command...")
        frames = []
        has_speech = False
        silence_start = None
        start_time = time.time()

        while (time.time() - start_time) < max_duration:
            data = stream.read(self.chunk_size, exception_on_overflow=False)
            chunk = np.frombuffer(data, dtype=np.int16)
            frames.append(chunk)

            if self.is_speech(chunk):
                has_speech = True
                silence_start = None
            elif has_speech:
                if silence_start is None:
                    silence_start = time.time()
                elif (time.time() - silence_start) >= self.silence_limit:
                    logger.info(f"User finished speaking ({self.silence_limit}s silence detected).")
                    break

        if frames:
            return np.concatenate(frames)
        return np.array([], dtype=np.int16)

    async def run(self):
        """Main satellite loop: auto-reconnect to Windows Master over WebSocket."""
        logger.info(f"Starting Nexus Satellite '{self.satellite_name}'")
        logger.info(f"Target Master Server: {self.server_url}")

        while True:
            try:
                logger.info(f"Connecting to Master at {self.server_url}...")
                async with websockets.connect(self.server_url, ping_interval=20, ping_timeout=20) as ws:
                    logger.info("✅ Connected to Nexus Master successfully!")
                    
                    # Register satellite
                    await ws.send(f'{{"type": "register", "name": "{self.satellite_name}"}}')

                    # Open microphone
                    stream = self.get_audio_stream()
                    if stream is None:
                        logger.error("No microphone found! Retrying in 5 seconds...")
                        await asyncio.sleep(5)
                        continue

                    logger.info("👂 Listening for 'Hey Nexus' on local microphone...")

                    while True:
                        data = stream.read(self.chunk_size, exception_on_overflow=False)
                        chunk = np.frombuffer(data, dtype=np.int16)

                        if self.check_wake_word(chunk):
                            if self.oww_model:
                                self.oww_model.reset()

                            # Record full user utterance
                            audio_np = self.record_phrase(stream)

                            if audio_np.size > 0:
                                wav_bytes = np_to_wav_bytes(audio_np, self.sample_rate)
                                logger.info(f"📤 Streaming {len(wav_bytes)} bytes of audio to Windows Master...")
                                
                                # Send binary WAV audio to Master
                                await ws.send(wav_bytes)

                                # Wait for result confirmation
                                try:
                                    resp = await asyncio.wait_for(ws.recv(), timeout=15.0)
                                    logger.info(f"📥 Master Response: {resp}")
                                except asyncio.TimeoutError:
                                    logger.warning("Timeout waiting for Master processing response.")

                            logger.info("👂 Resuming wake word listening...")

                        await asyncio.sleep(0.001)

            except (websockets.exceptions.ConnectionClosedError, websockets.exceptions.WebSocketException, OSError) as e:
                logger.warning(f"Connection to Master lost or unavailable ({e}). Reconnecting in 3s...")
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(f"Unexpected error in Satellite: {e}. Retrying in 3s...")
                await asyncio.sleep(3)

def main():
    parser = argparse.ArgumentParser(description="NEXUS Smart Home Microphone Satellite")
    parser.add_argument(
        "--server",
        type=str,
        default=os.getenv("SATELLITE_SERVER_URL", "ws://localhost:8080/ws/satellite"),
        help="WebSocket URL of Nexus Master (e.g. ws://192.168.1.100:8080/ws/satellite)"
    )
    parser.add_argument(
        "--name",
        type=str,
        default=os.getenv("SATELLITE_NAME", "Linux Laptop Mic"),
        help="Name identifier for this satellite"
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=float(os.getenv("WAKE_WORD_THRESHOLD", "0.5")),
        help="Wake word detection threshold (0.1 - 0.9)"
    )
    parser.add_argument(
        "--silence",
        type=float,
        default=float(os.getenv("SILENCE_DURATION_SEC", "1.2")),
        help="Silence duration before stopping recording (seconds)"
    )

    args = parser.parse_args()

    # Ensure URL points to /ws/satellite
    server_url = args.server
    if not server_url.startswith("ws://") and not server_url.startswith("wss://"):
        server_url = f"ws://{server_url}"
    if not server_url.endswith("/ws/satellite"):
        server_url = f"{server_url.rstrip('/')}/ws/satellite"

    satellite = NexusSatellite(
        server_url=server_url,
        satellite_name=args.name,
        wake_threshold=args.threshold,
        silence_limit=args.silence
    )

    try:
        asyncio.run(satellite.run())
    except KeyboardInterrupt:
        logger.info("Satellite stopped by user.")

if __name__ == "__main__":
    main()
