import aiohttp
import json
import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("NexusWebhook")

class WebhookClient:
    """Dispatches webhooks to external services or Home Assistant webhook triggers."""

    @staticmethod
    async def trigger(url: str, method: str = "POST", payload: Optional[Dict[str, Any]] = None, headers: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """Send an HTTP request to any webhook URL."""
        method_upper = method.upper()
        custom_headers = headers or {"Content-Type": "application/json"}
        
        try:
            async with aiohttp.ClientSession() as session:
                if method_upper == "GET":
                    async with session.get(url, headers=custom_headers, params=payload, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        text = await resp.text()
                        return {"success": resp.status < 400, "status_code": resp.status, "response": text}
                else:
                    async with session.post(url, headers=custom_headers, json=payload or {}, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                        text = await resp.text()
                        return {"success": resp.status < 400, "status_code": resp.status, "response": text}
        except Exception as e:
            logger.error(f"Failed to trigger webhook to {url}: {e}")
            return {"success": False, "error": str(e)}

webhook_client = WebhookClient()
