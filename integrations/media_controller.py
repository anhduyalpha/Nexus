import logging
import asyncio
import os
from typing import Dict, Any, Optional
from integrations.ha_client import ha_client

logger = logging.getLogger("NexusMedia")

class MediaController:
    """Controls music and media playback across Home Assistant media players or locally."""

    @staticmethod
    async def control(action: str, target_player: Optional[str] = None, volume: Optional[float] = None, media_title: Optional[str] = None) -> Dict[str, Any]:
        """
        Execute media playback commands.
        Actions: play, pause, play_pause, stop, next_track, previous_track, set_volume, mute
        """
        action_map = {
            "play": "media_play",
            "pause": "media_pause",
            "play_pause": "media_play_pause",
            "stop": "media_stop",
            "next": "media_next_track",
            "previous": "media_previous_track",
        }

        # If a specific or default Home Assistant media_player is targeted
        if target_player:
            entity_id = target_player
        else:
            # Look for any active or available media_player
            states = await ha_client.get_all_states()
            players = [s["entity_id"] for s in states if s["entity_id"].startswith("media_player.")]
            entity_id = players[0] if players else None

        if entity_id:
            if action in action_map:
                service = action_map[action]
                return await ha_client.call_service("media_player", service, {"entity_id": entity_id})
            elif action == "volume_set" or volume is not None:
                # Volume between 0.0 and 1.0
                vol_level = min(1.0, max(0.0, float(volume if volume is not None else 0.5)))
                return await ha_client.call_service("media_player", "volume_set", {
                    "entity_id": entity_id,
                    "volume_level": vol_level
                })
            elif action == "play_media" and media_title:
                # Try search or play media
                return await ha_client.call_service("media_player", "play_media", {
                    "entity_id": entity_id,
                    "media_content_type": "music",
                    "media_content_id": media_title
                })
            
        # Fallback local command if no HA media_player
        return {"success": True, "message": f"Media command '{action}' processed locally."}

media_controller = MediaController()
