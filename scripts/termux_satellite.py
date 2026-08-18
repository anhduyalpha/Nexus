#!/data/data/com.termux/files/usr/bin/python3
"""
NEXUS SMART HOME - TERMUX SATELLITE (XIAOMI ANDROID CLIENT)
============================================================
Runs natively inside Termux on Xiaomi Redmi Note 8 Pro.
- Zero audio feedback loop / Zero echo (Audio never routed to Windows speakers).
- Auto-pauses recording when Master Windows is speaking (AEC / Self-hearing prevention).
- High-Pass 80Hz filter + Dynamic Peak Normalizer (95% full scale).
- Listens for 'Hey Nexus' / 'Hey Jarvis' with openWakeWord (or energy VAD).
- Streams clean 16kHz voice commands directly to Windows GPU Master over ADB/WiFi.
"""

import sys
import time
import io
import os
import json
import base64
import argparse
import asyncio
import logging
import wave
import numpy as np
import websockets

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s"
)
logger = logging.getLogger("TermuxSatellite")

def np_to_wav_bytes(audio_np: np.ndarray, sample_rate: int = 16000) -> bytes:
    """Convert numpy int16 PCM array to WAV bytes in memory."""
    wav_io = io.BytesIO()
    with wave.open(wav_io, "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)  # 16-bit
        wf.setframerate(sample_rate)
        wf.writeframes(audio_np.tobytes())
    return wav_io.getvalue()

def draw_vu_bar(rms: float, max_score: float = 0.0, threshold: float = 0.10, bar_len: int = 20) -> str:
    """ASCII volume meter with wake score."""
    pct = min(1.0, rms * 4.0)
    filled = int(pct * bar_len)
    bar = "█" * filled + "░" * (bar_len - filled)
    status_icon = "🟢" if pct > 0.12 else "⚪"
    return f"[{bar}] {int(pct * 100):3d}% {status_icon} | Wake Score: {max_score:.2f}/{threshold:.2f}"

class AudioCleaner:
    """High-performance audio noise suppression, high-pass filter, and dynamic peak normalizer."""

    def __init__(self, sample_rate: int = 16000, gain: float = 8.0, noise_suppression: bool = True):
        self.sample_rate = sample_rate
        self.gain = gain
        self.noise_suppression = noise_suppression
        
        # High-pass filter state (Cutoff ~80Hz to eliminate fan/hum rumble)
        self.prev_x = 0.0
        self.prev_y = 0.0
        self.hp_alpha = 0.9695

        # Rolling noise floor tracking
        self.noise_floor = 0.001
        self.noise_alpha = 0.02

    def process(self, chunk_int16: np.ndarray) -> np.ndarray:
        """Filter noise and dynamically boost volume to maximum level in real-time."""
        if chunk_int16.size == 0:
            return chunk_int16

        # Convert to float [-1.0, 1.0]
        audio_float = chunk_int16.astype(np.float32) / 32768.0

        # 1. High-Pass Filter
        filtered = np.empty_like(audio_float)
        prev_x = self.prev_x
        prev_y = self.prev_y
        alpha = self.hp_alpha

        for i in range(len(audio_float)):
            curr_x = audio_float[i]
            curr_y = alpha * (prev_y + curr_x - prev_x)
            filtered[i] = curr_y
            prev_x = curr_x
            prev_y = curr_y

        self.prev_x = prev_x
        self.prev_y = prev_y

        # 2. Estimate RMS & Noise Floor
        current_rms = float(np.sqrt(np.mean(filtered ** 2) + 1e-9))
        self.noise_floor = (1 - self.noise_alpha) * self.noise_floor + self.noise_alpha * min(self.noise_floor * 1.5, current_rms)

        # 3. Dynamic Peak Normalization (Maximize to ~90% amplitude without clipping)
        peak = float(np.max(np.abs(filtered)))
        if peak > 0.001:
            target_boost = min(20.0, 0.90 / peak)
            amplified = np.tanh(filtered * target_boost)
        else:
            amplified = np.tanh(filtered * self.gain)

        # Convert back to int16
        clean_int16 = (amplified * 32767.0).astype(np.int16)
        return clean_int16

class TermuxSatellite:
    """Termux Android Satellite client."""

    def __init__(
        self,
        server_url: str = "ws://127.0.0.1:8080/ws/satellite",
        satellite_name: str = "Xiaomi Redmi Note 8 Pro (Termux)",
        wake_model: str = "hey_nexus",
        wake_threshold: float = 0.10,
        gain: float = 8.0,
        silence_limit: float = 1.2,
        sample_rate: int = 16000
    ):
        self.server_url = server_url
        self.satellite_name = satellite_name
        self.wake_model_name = wake_model
        self.wake_threshold = wake_threshold
        self.gain = gain
        self.silence_limit = silence_limit
        self.sample_rate = sample_rate
        self.chunk_size = 1280  # 80ms at 16kHz

        self.cleaner = AudioCleaner(sample_rate=self.sample_rate, gain=self.gain, noise_suppression=True)
        self.oww_model = None
        self.pa = None
        self.is_test_recording = False
        self.is_master_speaking = False

        # Initialize openWakeWord if available
        try:
            import openwakeword
            from openwakeword.model import Model
            try:
                if self.wake_model_name and self.wake_model_name not in ["hey_nexus"]:
                    self.oww_model = Model(wakeword_models=[self.wake_model_name], inference_framework="onnx")
                else:
                    self.oww_model = Model(wakeword_models=["hey_jarvis", "alexa"], inference_framework="onnx")
            except Exception:
                self.oww_model = Model(inference_framework="onnx")

            logger.info(f"openWakeWord initialized on Android: {list(self.oww_model.models.keys())} (Threshold: {self.wake_threshold})")
        except Exception as e:
            logger.info(f"Using Voice Activity Energy Mode ({e})")
            self.oww_model = None

    def get_audio_stream(self):
        """Open microphone PyAudio stream on Android."""
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
            logger.error(f"Could not open microphone stream on Android: {e}")
            return None

    def check_wake_word(self, chunk: np.ndarray) -> tuple:
        """Check if wake word is detected in the audio chunk."""
        max_score = 0.0
        if self.oww_model is not None:
            try:
                preds = self.oww_model.predict(chunk)
                for model_key, score in preds.items():
                    if score > max_score:
                        max_score = score
                    if score >= self.wake_threshold:
                        logger.info(f"\n⚡ WAKE WORD TRIGGERED: '{model_key}' (score: {score:.3f} >= {self.wake_threshold})")
                        return True, max_score
            except Exception as e:
                logger.error(f"Wake word prediction error: {e}")
        return False, max_score

    def is_speech(self, chunk: np.ndarray) -> bool:
        """Ultra-sensitive energy-based voice activity detection."""
        audio_float = chunk.astype(np.float32) / 32768.0
        rms = float(np.sqrt(np.mean(audio_float ** 2)))
        return rms > 0.006

    def record_phrase(self, stream, max_duration: float = 12.0) -> np.ndarray:
        """Record spoken command after wake word until silence is detected."""
        logger.info("\n🎙️ [REC] ĐANG THU ÂM CÂU LỆNH TỪ XIAOMI (HÃY NÓI)...")
        frames = []
        has_speech = False
        silence_start = None
        start_time = time.time()

        while (time.time() - start_time) < max_duration:
            data = stream.read(self.chunk_size, exception_on_overflow=False)
            raw_chunk = np.frombuffer(data, dtype=np.int16)
            clean_chunk = self.cleaner.process(raw_chunk)
            frames.append(clean_chunk)

            if self.is_speech(clean_chunk):
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

    def record_fixed_duration(self, stream, duration_sec: float = 5.0) -> np.ndarray:
        """Record a fixed duration clip with maximum amplification."""
        logger.info(f"\n🎙️ Diagnostic recording in progress ({duration_sec}s)...")
        frames = []
        num_chunks = int((self.sample_rate * duration_sec) / self.chunk_size)
        for _ in range(num_chunks):
            data = stream.read(self.chunk_size, exception_on_overflow=False)
            raw_chunk = np.frombuffer(data, dtype=np.int16)
            clean_chunk = self.cleaner.process(raw_chunk)
            frames.append(clean_chunk)
        return np.concatenate(frames) if frames else np.array([], dtype=np.int16)

    async def _receiver_task(self, ws, stream):
        """Listen for server-side diagnostic and control messages."""
        try:
            async for raw_msg in ws:
                try:
                    payload = json.loads(raw_msg)
                    msg_type = payload.get("type", "")
                    if msg_type == "trigger_test_record":
                        duration = float(payload.get("duration", 5.0))
                        logger.info(f"\n📢 Received command from Master: Test Record for {duration}s")
                        self.is_test_recording = True
                        
                        audio_np = self.record_fixed_duration(stream, duration)
                        self.is_test_recording = False
                        
                        if audio_np.size > 0:
                            wav_bytes = np_to_wav_bytes(audio_np, self.sample_rate)
                            b64_audio = base64.b64encode(wav_bytes).decode('utf-8')
                            await ws.send(json.dumps({
                                "type": "test_audio_result",
                                "audio_b64": b64_audio,
                                "name": self.satellite_name
                            }))
                            logger.info(f"📤 Sent {len(wav_bytes)} bytes of Xiaomi test audio to Master!")
                    elif msg_type == "speaker_status":
                        self.is_master_speaking = bool(payload.get("active", False))
                except Exception as e:
                    logger.error(f"Error handling message from Master: {e}")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.warning(f"Receiver task stopped: {e}")

    async def run(self):
        """Main satellite loop: connect to Windows Master over WebSocket."""
        logger.info(f"Starting Xiaomi Termux Satellite '{self.satellite_name}'")
        logger.info(f"Target Master: {self.server_url}")

        while True:
            try:
                logger.info(f"Connecting to Nexus Master at {self.server_url}...")
                async with websockets.connect(self.server_url, ping_interval=20, ping_timeout=20) as ws:
                    logger.info("✅ Connected to Nexus Master successfully!")
                    
                    # Register satellite
                    await ws.send(json.dumps({"type": "register", "name": self.satellite_name}))

                    # Open microphone
                    stream = self.get_audio_stream()
                    if stream is None:
                        logger.error("No audio stream found! Retrying in 5 seconds...")
                        await asyncio.sleep(5)
                        continue

                    # Start background receiver for remote commands
                    receiver_coro = asyncio.create_task(self._receiver_task(ws, stream))

                    print("\n" + "=" * 65)
                    print(" 📱 ĐANG LẮNG NGHE QUA MICROPHONE ĐIỆN THOẠI XIAOMI (TERMUX):")
                    print("=" * 65)
                    frame_counter = 0

                    try:
                        while True:
                            if self.is_test_recording or self.is_master_speaking:
                                await asyncio.sleep(0.1)
                                continue

                            data = stream.read(self.chunk_size, exception_on_overflow=False)
                            raw_chunk = np.frombuffer(data, dtype=np.int16)
                            
                            # Clean noise and maximize amplitude
                            clean_chunk = self.cleaner.process(raw_chunk)

                            # Calculate RMS
                            audio_float = clean_chunk.astype(np.float32) / 32768.0
                            rms = float(np.sqrt(np.mean(audio_float ** 2)))

                            # Check Wake Word on amplified audio
                            triggered, score = self.check_wake_word(clean_chunk)

                            # Print live console VU meter
                            frame_counter += 1
                            if frame_counter % 2 == 0:
                                vu_str = draw_vu_bar(rms, score, self.wake_threshold)
                                print(f"\r  🎙️ XIAOMI MIC: {vu_str} ", end="", flush=True)

                                # Forward volume pulse to Master Web HUD
                                try:
                                    await ws.send(json.dumps({"type": "volume", "rms": rms}))
                                except Exception:
                                    pass

                            if triggered:
                                if self.oww_model:
                                    self.oww_model.reset()

                                # Record full user utterance
                                audio_np = self.record_phrase(stream)

                                if audio_np.size > 0:
                                    wav_bytes = np_to_wav_bytes(audio_np, self.sample_rate)
                                    logger.info(f"📤 Streaming {len(wav_bytes)} bytes of voice command to Windows Master...")
                                    
                                    # Send binary WAV audio to Master
                                    await ws.send(wav_bytes)

                                    # Wait for result confirmation
                                    try:
                                        resp = await asyncio.wait_for(ws.recv(), timeout=15.0)
                                        logger.info(f"📥 Master Response: {resp}")
                                    except asyncio.TimeoutError:
                                        logger.warning("Timeout waiting for Master response.")

                                logger.info("👂 Resuming listening on Xiaomi mic...")

                            await asyncio.sleep(0.001)
                    finally:
                        receiver_coro.cancel()

            except (websockets.exceptions.ConnectionClosedError, websockets.exceptions.WebSocketException, OSError) as e:
                logger.warning(f"Connection to Master lost or unavailable ({e}). Reconnecting in 3s...")
                await asyncio.sleep(3)
            except Exception as e:
                logger.error(f"Unexpected error in Xiaomi Satellite: {e}. Retrying in 3s...")
                await asyncio.sleep(3)

def main():
    parser = argparse.ArgumentParser(description="NEXUS Xiaomi Termux Satellite")
    parser.add_argument(
        "--server",
        type=str,
        default=os.getenv("SATELLITE_SERVER_URL", "ws://127.0.0.1:8080/ws/satellite"),
        help="WebSocket URL of Nexus Master (default: ws://127.0.0.1:8080/ws/satellite)"
    )
    parser.add_argument(
        "--name",
        type=str,
        default=os.getenv("SATELLITE_NAME", "Xiaomi Redmi Note 8 Pro (Termux)"),
        help="Name identifier for this satellite"
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=float(os.getenv("WAKE_WORD_THRESHOLD", "0.10")),
        help="Wake word detection threshold"
    )
    parser.add_argument(
        "--gain",
        type=float,
        default=float(os.getenv("AUDIO_GAIN", "8.0")),
        help="Software pre-amp volume multiplier"
    )

    args = parser.parse_args()

    satellite = TermuxSatellite(
        server_url=args.server,
        satellite_name=args.name,
        wake_threshold=args.threshold,
        gain=args.gain
    )

    try:
        asyncio.run(satellite.run())
    except KeyboardInterrupt:
        print("\n[!] Satellite stopped by user.")

if __name__ == "__main__":
    main()
