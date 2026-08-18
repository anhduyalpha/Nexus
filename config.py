import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent

try:
    from dotenv import load_dotenv
    if (BASE_DIR / ".env").exists():
        load_dotenv(BASE_DIR / ".env")
    else:
        load_dotenv()
except ImportError:
    # Minimal fallback parser if dotenv is not installed yet
    env_file = BASE_DIR / ".env"
    if env_file.exists():
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ.setdefault(k.strip(), v.strip())
        except Exception:
            pass

# Directories
STATIC_DIR = BASE_DIR / "web" / "static"
SOUNDS_DIR = STATIC_DIR / "sounds"
TEMPLATES_DIR = BASE_DIR / "web" / "templates"

SOUNDS_DIR.mkdir(parents=True, exist_ok=True)

class Config:
    # Home Assistant
    HA_URL: str = os.getenv("HA_URL", "http://localhost:8123").rstrip("/")
    HA_TOKEN: str = os.getenv("HA_TOKEN", "")

    # LLM Engine (gemini / ollama / local)
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "gemini").lower()
    
    # Gemini AI
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GEMINI_MODEL: str = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")

    # Local LLM (Ollama / LocalAI / llama.cpp)
    OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434").rstrip("/")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:1.5b")

    # Audio & Voice Pipeline
    WAKE_WORD_MODEL: str = os.getenv("WAKE_WORD_MODEL", "hey_nexus")
    WAKE_WORD_THRESHOLD: float = float(os.getenv("WAKE_WORD_THRESHOLD", "0.5"))
    SILENCE_DURATION_SEC: float = float(os.getenv("SILENCE_DURATION_SEC", "1.2"))
    SAMPLE_RATE: int = int(os.getenv("SAMPLE_RATE", "16000"))

    # Faster Whisper STT (GPU CUDA Auto-Detection)
    WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "base")
    WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "auto")
    WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "float16")
    STT_LANGUAGE: str = os.getenv("STT_LANGUAGE", "vi")

    # Edge TTS
    TTS_VOICE: str = os.getenv("TTS_VOICE", "vi-VN-NamMinhNeural")
    TTS_RATE: str = os.getenv("TTS_RATE", "+5%")
    TTS_PITCH: str = os.getenv("TTS_PITCH", "+0Hz")

    # Web Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8080"))
    DEBUG: bool = os.getenv("DEBUG", "false").lower() == "true"

    # Sound effects paths
    WAKE_SOUND: Path = SOUNDS_DIR / "wake_chime.wav"
    READY_SOUND: Path = SOUNDS_DIR / "ready_chime.wav"
    DONE_SOUND: Path = SOUNDS_DIR / "done_chime.wav"
    ERROR_SOUND: Path = SOUNDS_DIR / "error_chime.wav"

    @classmethod
    def update(cls, **kwargs):
        """Update runtime configurations and save back to .env if desired."""
        for k, v in kwargs.items():
            if hasattr(cls, k):
                setattr(cls, k, v)
                os.environ[k] = str(v)

config = Config()
