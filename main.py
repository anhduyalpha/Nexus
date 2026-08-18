import sys
import os
import uvicorn
import logging
import argparse
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from config import config
from scripts.generate_chimes import generate_all
from core.orchestrator import orchestrator
from web.app import app

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] (%(name)s) %(message)s"
)
logger = logging.getLogger("NexusMain")

def main():
    parser = argparse.ArgumentParser(description="NEXUS Smart Home AI Voice Assistant & Server")
    parser.add_argument("--host", type=str, default=config.HOST, help="Host address to bind")
    parser.add_argument("--port", type=int, default=config.PORT, help="Port to run web server")
    parser.add_argument("--no-voice", action="store_true", help="Disable microphone voice listener (Web only)")
    args = parser.parse_args()

    # 1. Ensure sound effects are generated
    try:
        generate_all()
    except Exception as e:
        logger.warning(f"Could not pre-generate audio chimes: {e}")

    # 2. Start Voice Orchestrator
    if not args.no_voice:
        logger.info("Initializing Nexus Local Voice Orchestrator...")
        orchestrator.start()
    else:
        logger.info("📱 Dedicated Phone Microphone Hub Mode active (Local host microphone listener disabled).")
        orchestrator.is_running = True
        orchestrator.set_state("LISTENING_WAKE")

    # 3. Print Banner
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except Exception:
        pass

    print("\n" + "="*60)
    print(" [*] N.E.X.U.S. SMART HOME INTELLIGENCE SYSTEM")
    print(f" [>] Web Dashboard: http://{args.host}:{args.port}")
    print(f" [>] Phone Mic WS:  ws://{args.host}:{args.port}/ws/satellite")
    print(f" [>] Home Assistant: {config.HA_URL}")
    print(f" [>] AI Brain Provider: {config.LLM_PROVIDER}")
    print("="*60 + "\n")

    # 4. Start Web Server
    try:
        uvicorn.run(
            app,
            host=args.host,
            port=args.port,
            log_level="info",
            access_log=False
        )
    except (KeyboardInterrupt, SystemExit):
        logger.info("Shutting down Nexus...")
    except Exception as e:
        logger.error(f"Uvicorn server error: {e}")
    finally:
        orchestrator.stop()

if __name__ == "__main__":
    main()
