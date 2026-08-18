import os
import io
import time
import asyncio
import json
import logging
import numpy as np
from typing import Dict, Any, List, Optional
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Form, UploadFile, File
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from pydantic import BaseModel

from config import config, STATIC_DIR, TEMPLATES_DIR, SOUNDS_DIR
from core.orchestrator import orchestrator
from core.sound_effects import sound_effects
from core.brain import nexus_brain
from core.stt import stt_engine
from integrations.ha_client import ha_client
from integrations.webhook_client import webhook_client
from integrations.media_controller import media_controller

logger = logging.getLogger("NexusWeb")

app = FastAPI(title="NEXUS Smart Home Interface", version="2.0")

# Mount Static & Templates
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")
templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

# WebSocket Active Connections
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in list(self.active_connections):
            try:
                await connection.send_json(message)
            except Exception:
                self.disconnect(connection)

manager = ConnectionManager()

main_loop: Optional[asyncio.AbstractEventLoop] = None

@app.on_event("startup")
async def startup_event():
    global main_loop
    main_loop = asyncio.get_running_loop()

# Hook orchestrator events to WebSocket broadcast (Thread-safe)
def on_orchestrator_event(event: Dict[str, Any]):
    global main_loop
    if main_loop and main_loop.is_running():
        try:
            asyncio.run_coroutine_threadsafe(manager.broadcast(event), main_loop)
        except Exception:
            pass

orchestrator.register_event_listener(on_orchestrator_event)

# Request Models
class CommandRequest(BaseModel):
    command: str

class DeviceControlRequest(BaseModel):
    entity_id: str
    action: str
    params: Dict[str, Any] = {}

class WebhookTestRequest(BaseModel):
    url: str
    method: str = "POST"
    payload: Dict[str, Any] = {}

class SettingsUpdateRequest(BaseModel):
    ha_url: str
    ha_token: str
    gemini_api_key: str
    gemini_model: str
    tts_voice: str
    wake_threshold: float
    llm_provider: Optional[str] = "gemini"

# Routes
@app.get("/", response_class=HTMLResponse)
async def get_index(request: Request):
    ha_status = await ha_client.check_connection()
    return templates.TemplateResponse(
        request=request,
        name="index.html",
        context={
            "config": config,
            "ha_status": ha_status
        }
    )

@app.get("/satellite", response_class=HTMLResponse)
async def get_satellite_page(request: Request):
    return templates.TemplateResponse(
        request=request,
        name="satellite.html",
        context={"config": config}
    )

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    # Send initial state
    await websocket.send_json({
        "type": "init_state",
        "state": orchestrator.state,
        "is_muted": orchestrator.is_muted,
        "ha_status": await ha_client.check_connection(),
        "satellite_status": {
            "connected": len(active_satellites) > 0,
            "name": list(active_satellites.values())[0] if active_satellites else "None",
            "total_satellites": len(active_satellites)
        }
    })
    try:
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            if action == "toggle_mute":
                is_muted = orchestrator.toggle_mute()
                await websocket.send_json({"type": "mute_status", "is_muted": is_muted})
            elif action == "play_chime":
                chime_type = data.get("chime", "wake")
                if chime_type == "wake":
                    sound_effects.play_wake()
                elif chime_type == "done":
                    sound_effects.play_done()
                elif chime_type == "error":
                    sound_effects.play_error()
            elif action == "send_command":
                cmd = data.get("text", "")
                if cmd:
                    asyncio.create_task(orchestrator.trigger_manual_command(cmd))
    except WebSocketDisconnect:
        manager.disconnect(websocket)

active_satellites: Dict[int, str] = {}
connected_satellite_sockets: Dict[int, WebSocket] = {}

async def _async_broadcast_speaker_status(active: bool):
    for ws_id, ws in list(connected_satellite_sockets.items()):
        try:
            await ws.send_json({"type": "speaker_status", "active": active})
        except Exception:
            pass
    try:
        await manager.broadcast({"type": "speaker_status", "active": active})
    except Exception:
        pass

def broadcast_speaker_status(active: bool):
    """Notify all connected satellites and Web HUD when TTS speaker starts/stops (Thread-safe)."""
    global main_loop
    if main_loop and main_loop.is_running():
        try:
            asyncio.run_coroutine_threadsafe(_async_broadcast_speaker_status(active), main_loop)
        except Exception:
            pass



@app.websocket("/ws/satellite")
async def satellite_websocket_endpoint(websocket: WebSocket):
    """
    Dedicated WebSocket endpoint for remote microphone satellites (e.g. Linux Laptop/Server).
    Receives recorded audio chunks when wake word is detected on the satellite.
    """
    await websocket.accept()
    ws_id = id(websocket)
    client_ip = websocket.client.host if websocket.client else "LAN"
    satellite_name = f"Satellite ({client_ip})"
    active_satellites[ws_id] = satellite_name
    connected_satellite_sockets[ws_id] = websocket
    logger.info(f"🟢 New Satellite connected: {satellite_name}")

    # Broadcast to Web HUD
    await manager.broadcast({
        "type": "satellite_status",
        "connected": True,
        "name": satellite_name,
        "total_satellites": len(active_satellites)
    })

    try:
        await websocket.send_json({
            "type": "welcome",
            "message": "Connected to Nexus Master (Windows GPU)",
            "state": orchestrator.state
        })

        while True:
            # Receive either binary audio data or JSON metadata
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                raw_bytes = message["bytes"]
                logger.info(f"🎙️ Received audio payload from {satellite_name} ({len(raw_bytes)} bytes)")
                result = await orchestrator.process_external_audio(raw_bytes, satellite_name=satellite_name)
                await websocket.send_json({
                    "type": "result",
                    "status": "success",
                    "result": result
                })

            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                except Exception:
                    payload = {}

                msg_type = payload.get("type", "")
                if msg_type == "wake_detected":
                    logger.info(f"⚡ Instant Wake Triggered from {satellite_name}")
                    orchestrator.notify_wake_detected(satellite_name)

                elif msg_type == "register":
                    satellite_name = payload.get("name", satellite_name)
                    active_satellites[ws_id] = satellite_name
                    logger.info(f"Satellite registered name: {satellite_name}")
                    await manager.broadcast({
                        "type": "satellite_status",
                        "connected": True,
                        "name": satellite_name,
                        "total_satellites": len(active_satellites)
                    })
                    await websocket.send_json({"type": "registered", "name": satellite_name})

                elif msg_type == "volume":
                    rms = payload.get("rms", 0.0)
                    # Forward to Web HUD
                    await manager.broadcast({
                        "type": "satellite_audio_level",
                        "rms": rms,
                        "name": satellite_name
                    })

                elif msg_type == "test_audio_result":
                    import base64
                    import soundfile as sf
                    b64_str = payload.get("audio_b64", "")
                    raw_bytes = base64.b64decode(b64_str)
                    
                    # Save test audio for web playback
                    test_sound_path = STATIC_DIR / "sounds" / "satellite_test.wav"
                    test_sound_path.parent.mkdir(parents=True, exist_ok=True)
                    with open(test_sound_path, "wb") as f:
                        f.write(raw_bytes)

                    # Transcribe using Faster-Whisper GPU
                    try:
                        data, samplerate = sf.read(io.BytesIO(raw_bytes), dtype='int16')
                        if len(data.shape) > 1:
                            data = data.mean(axis=1).astype(np.int16)
                        text = stt_engine.transcribe(data, sample_rate=samplerate)
                    except Exception as ex:
                        logger.error(f"Error transcribing test audio: {ex}")
                        text = f"(Lỗi STT: {ex})"

                    logger.info(f"🎤 Satellite Test STT Result: '{text}'")
                    await manager.broadcast({
                        "type": "satellite_test_result",
                        "text": text,
                        "audio_url": f"/static/sounds/satellite_test.wav?t={int(time.time())}"
                    })

                elif msg_type == "ping":
                    await websocket.send_json({"type": "pong", "time": time.time()})

                elif msg_type == "audio_b64":
                    import base64
                    b64_str = payload.get("audio", "")
                    raw_bytes = base64.b64decode(b64_str)
                    result = await orchestrator.process_external_audio(raw_bytes, satellite_name=satellite_name)
                    await websocket.send_json({
                        "type": "result",
                        "status": "success",
                        "result": result
                    })

    except WebSocketDisconnect:
        logger.info(f"🔴 Satellite disconnected: {satellite_name}")
    except Exception as e:
        logger.error(f"Error in satellite websocket: {e}")
    finally:
        active_satellites.pop(ws_id, None)
        connected_satellite_sockets.pop(ws_id, None)
        await manager.broadcast({
            "type": "satellite_status",
            "connected": len(active_satellites) > 0,
            "name": list(active_satellites.values())[0] if active_satellites else "None",
            "total_satellites": len(active_satellites)
        })

@app.post("/api/satellite/test")
async def api_satellite_test_trigger():
    """Trigger remote diagnostic recording on all connected satellites."""
    if not connected_satellite_sockets:
        return JSONResponse({"status": "error", "message": "Chưa có Microphone vệ tinh nào kết nối!"}, status_code=400)

    for client_ip, ws in list(connected_satellite_sockets.items()):
        try:
            await ws.send_json({"type": "trigger_test_record", "duration": 5.0})
        except Exception as e:
            logger.warning(f"Failed to send test command to satellite {client_ip}: {e}")

    return {"status": "ok", "message": "Đã gửi lệnh thu âm 5 giây tới Linux Satellite."}

@app.post("/api/satellite/audio")
async def api_satellite_audio(request: Request):
    """REST API endpoint to upload audio bytes directly from any satellite or curl."""
    raw_bytes = await request.body()
    if not raw_bytes:
        return JSONResponse({"error": "Empty audio body"}, status_code=400)

    result = await orchestrator.process_external_audio(raw_bytes, satellite_name="REST Satellite")
    return JSONResponse(result)

@app.get("/api/status")
async def api_get_status():
    ha_info = await ha_client.check_connection()
    return {
        "status": "online",
        "state": orchestrator.state,
        "is_muted": orchestrator.is_muted,
        "home_assistant": ha_info,
        "brain_model": config.GEMINI_MODEL,
        "tts_voice": config.TTS_VOICE
    }

@app.get("/api/devices")
async def api_get_devices():
    devices = await ha_client.get_clean_entity_summary()
    return {"devices": devices, "total": len(devices)}

@app.post("/api/devices/control")
async def api_control_device(req: DeviceControlRequest):
    domain = req.entity_id.split(".")[0] if "." in req.entity_id else "homeassistant"
    res = await ha_client.call_service(domain, req.action, {"entity_id": req.entity_id, **req.params})
    return res

@app.post("/api/command")
async def api_post_command(req: CommandRequest):
    result = await orchestrator.trigger_manual_command(req.command)
    return result

@app.post("/api/webhook/test")
async def api_test_webhook(req: WebhookTestRequest):
    result = await webhook_client.trigger(req.url, req.method, req.payload)
    return result

@app.get("/api/settings")
async def api_get_settings():
    return {
        "ha_url": config.HA_URL,
        "ha_token_set": bool(config.HA_TOKEN),
        "gemini_api_key_set": bool(config.GEMINI_API_KEY),
        "gemini_model": config.GEMINI_MODEL,
        "llm_provider": config.LLM_PROVIDER,
        "ollama_model": config.OLLAMA_MODEL,
        "tts_voice": config.TTS_VOICE,
        "wake_threshold": config.WAKE_WORD_THRESHOLD
    }

@app.post("/api/settings")
async def api_update_settings(req: SettingsUpdateRequest):
    config.update(
        HA_URL=req.ha_url,
        HA_TOKEN=req.ha_token or config.HA_TOKEN,
        GEMINI_API_KEY=req.gemini_api_key or config.GEMINI_API_KEY,
        GEMINI_MODEL=req.gemini_model,
        LLM_PROVIDER=req.llm_provider or config.LLM_PROVIDER,
        TTS_VOICE=req.tts_voice,
        WAKE_WORD_THRESHOLD=req.wake_threshold
    )
    ha_client.base_url = config.HA_URL
    if req.ha_token:
        ha_client.token = config.HA_TOKEN
    if req.gemini_api_key:
        nexus_brain.api_key = config.GEMINI_API_KEY
    if req.gemini_model:
        nexus_brain.model_name = req.gemini_model
    return {"status": "ok", "message": "Settings updated successfully."}

@app.post("/api/test/transcribe")
async def api_test_transcribe(file: UploadFile = File(...)):
    """Transcribe an audio clip uploaded from the browser microphone test."""
    try:
        content = await file.read()
        import soundfile as sf
        import tempfile

        # Try reading directly or through temporary file
        try:
            data, samplerate = sf.read(io.BytesIO(content), dtype='int16')
        except Exception:
            suffix = Path(file.filename or "test.webm").suffix or ".webm"
            with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tf:
                tf.write(content)
                temp_path = tf.name
            try:
                data, samplerate = sf.read(temp_path, dtype='int16')
            finally:
                if os.path.exists(temp_path):
                    try:
                        os.remove(temp_path)
                    except Exception:
                        pass

        if len(data.shape) > 1:
            data = data.mean(axis=1).astype(np.int16)

        text = stt_engine.transcribe(data, sample_rate=samplerate)
        logger.info(f"Test Mic Transcription: '{text}'")
        return {"status": "ok", "text": text}
    except Exception as e:
        logger.error(f"Error in test transcribe: {e}")
        return JSONResponse({"status": "error", "error": str(e), "text": ""}, status_code=500)

@app.get("/api/ollama/status")
async def api_get_ollama_status():
    """Check Ollama server connection and list available models."""
    import aiohttp
    url = f"{config.OLLAMA_URL}/api/tags"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=3)) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    models = [m.get("name") for m in data.get("models", [])]
                    return {"online": True, "models": models, "active": config.OLLAMA_MODEL}
                return {"online": False, "models": [], "error": f"HTTP {resp.status}"}
    except Exception as e:
        return {"online": False, "models": [], "error": str(e)}
