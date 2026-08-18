import asyncio
import aiohttp
import json
import logging
from typing import Dict, Any, List, Optional
from config import config

logger = logging.getLogger("NexusHAClient")

class HomeAssistantClient:
    """Asynchronous client for Home Assistant REST and WebSocket API."""

    def __init__(self, base_url: Optional[str] = None, token: Optional[str] = None):
        self.base_url = (base_url or config.HA_URL).rstrip("/")
        self.token = token or config.HA_TOKEN
        self._cached_entities: Dict[str, Dict[str, Any]] = {}
        self._last_sync_time = 0

    @property
    def headers(self) -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    async def check_connection(self) -> Dict[str, Any]:
        """Verify connection to Home Assistant and return basic info."""
        if not self.token:
            return {"status": "error", "message": "Home Assistant Token is not configured."}

        url = f"{self.base_url}/api/"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=self.headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        data = await resp.json()
                        return {"status": "ok", "message": data.get("message", "API running"), "url": self.base_url}
                    elif resp.status == 401:
                        return {"status": "error", "message": "Unauthorized. Please check your Long-Lived Access Token."}
                    else:
                        return {"status": "error", "message": f"HTTP {resp.status}: {await resp.text()}"}
        except Exception as e:
            return {"status": "error", "message": f"Connection failed: {str(e)}"}

    async def get_all_states(self, force_refresh: bool = False) -> List[Dict[str, Any]]:
        """Fetch all states from Home Assistant and cache them."""
        url = f"{self.base_url}/api/states"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=self.headers, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                    if resp.status == 200:
                        states = await resp.json()
                        self._cached_entities = {s["entity_id"]: s for s in states}
                        return states
                    else:
                        logger.error(f"Failed to fetch states: HTTP {resp.status}")
                        return []
        except Exception as e:
            logger.debug(f"Home Assistant is offline or unreachable at {self.base_url}: {e}")
            return []

    async def get_state(self, entity_id: str) -> Optional[Dict[str, Any]]:
        """Fetch current state of a specific entity."""
        url = f"{self.base_url}/api/states/{entity_id}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(url, headers=self.headers, timeout=aiohttp.ClientTimeout(total=5)) as resp:
                    if resp.status == 200:
                        state_data = await resp.json()
                        self._cached_entities[entity_id] = state_data
                        return state_data
                    return None
        except Exception as e:
            logger.error(f"Error getting state for {entity_id}: {e}")
            return None

    async def call_service(self, domain: str, service: str, service_data: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Execute a service in Home Assistant (e.g. light.turn_on, switch.turn_off)."""
        url = f"{self.base_url}/api/services/{domain}/{service}"
        payload = service_data or {}
        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(url, headers=self.headers, json=payload, timeout=aiohttp.ClientTimeout(total=8)) as resp:
                    if resp.status in (200, 201):
                        res_json = await resp.json()
                        return {"success": True, "result": res_json}
                    else:
                        err_msg = await resp.text()
                        return {"success": False, "error": f"HTTP {resp.status}: {err_msg}"}
        except Exception as e:
            logger.error(f"Failed to call service {domain}.{service}: {e}")
            return {"success": False, "error": str(e)}

    async def get_clean_entity_summary(self) -> List[Dict[str, str]]:
        """Return a simplified list of entities tailored for LLM prompt context."""
        states = await self.get_all_states()
        summary = []
        # Filter relevant domains for smart home voice control
        allowed_domains = {
            "light", "switch", "climate", "fan", "cover", "lock", 
            "media_player", "sensor", "binary_sensor", "scene", "script", "automation"
        }
        for item in states:
            entity_id = item.get("entity_id", "")
            domain = entity_id.split(".")[0]
            if domain in allowed_domains:
                attrs = item.get("attributes", {})
                friendly_name = attrs.get("friendly_name", entity_id)
                current_state = item.get("state", "unknown")
                unit = attrs.get("unit_of_measurement", "")
                
                summary.append({
                    "entity_id": entity_id,
                    "domain": domain,
                    "name": friendly_name,
                    "state": f"{current_state} {unit}".strip()
                })
        return summary

    async def search_entity(self, query: str) -> Optional[str]:
        """Fuzzy find an entity ID matching a user-spoken name."""
        if not self._cached_entities:
            await self.get_all_states()

        query_lower = query.lower().strip()
        # Direct exact match
        for entity_id, data in self._cached_entities.items():
            name = data.get("attributes", {}).get("friendly_name", "").lower()
            if query_lower == name or query_lower == entity_id.lower():
                return entity_id

        # Substring match
        for entity_id, data in self._cached_entities.items():
            name = data.get("attributes", {}).get("friendly_name", "").lower()
            if query_lower in name or name in query_lower:
                return entity_id

        return None

ha_client = HomeAssistantClient()
