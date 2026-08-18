import os
import io
import asyncio
import logging
import tempfile
from pathlib import Path
from typing import Optional
from config import config

logger = logging.getLogger("NexusTTS")

class TextToSpeech:
    """Text-to-Speech engine using Microsoft Edge-TTS with rich natural neural voices."""

    def __init__(
        self,
        voice: str = "vi-VN-NamMinhNeural",
        rate: str = "+5%",
        pitch: str = "+0Hz"
    ):
        self.voice = voice or config.TTS_VOICE
        self.rate = rate or config.TTS_RATE
        self.pitch = pitch or config.TTS_PITCH

    async def synthesize_to_bytes(self, text: str) -> bytes:
        """Synthesize text into MP3 audio bytes using edge-tts."""
        import edge_tts
        communicate = edge_tts.Communicate(
            text=text,
            voice=self.voice,
            rate=self.rate,
            pitch=self.pitch
        )
        audio_stream = io.BytesIO()
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_stream.write(chunk["data"])
        return audio_stream.getvalue()

    async def speak(self, text: str):
        """Synthesize text and play it through the speakers."""
        if not text or not text.strip():
            return

        clean_text = text.strip()
        logger.info(f"Nexus Speaking: '{clean_text}'")

        try:
            audio_bytes = await self.synthesize_to_bytes(clean_text)
            
            # Save temporarily and play
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tf:
                tf.write(audio_bytes)
                temp_audio_path = tf.name

            try:
                # Play using soundfile / sounddevice or system command (ffplay/mpv/mpg123)
                proc = await asyncio.create_subprocess_exec(
                    "ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", temp_audio_path,
                    stdout=asyncio.subprocess.DEVNULL,
                    stderr=asyncio.subprocess.DEVNULL
                )
                await proc.wait()
            except FileNotFoundError:
                # Fallback to mpg123 / cvlc / paplay
                try:
                    proc = await asyncio.create_subprocess_exec(
                        "mpv", "--no-video", "--really-quiet", temp_audio_path,
                        stdout=asyncio.subprocess.DEVNULL,
                        stderr=asyncio.subprocess.DEVNULL
                    )
                    await proc.wait()
                except Exception:
                    # Windows or fallback python player
                    try:
                        import soundfile as sf
                        import sounddevice as sd
                        data, fs = sf.read(temp_audio_path)
                        sd.play(data, fs)
                        sd.wait()
                    except Exception as e:
                        logger.warning(f"Audio playback error: {e}")
            finally:
                if os.path.exists(temp_audio_path):
                    try:
                        os.remove(temp_audio_path)
                    except Exception:
                        pass
        except Exception as e:
            logger.error(f"TTS synthesis/playback error: {e}")

tts_engine = TextToSpeech()
