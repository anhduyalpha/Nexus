import json
import logging
from typing import Dict, Any, List, Optional
from config import config
from integrations.ha_client import ha_client
from integrations.webhook_client import webhook_client
from integrations.media_controller import media_controller

logger = logging.getLogger("NexusBrain")

NEXUS_SYSTEM_PROMPT = """Bạn là NEXUS - Trợ lý siêu AI thông minh, quyền năng và tối tân.
Nhiệm vụ của bạn là phục vụ người dùng (gọi người dùng là "Sir", "Ngài", hoặc "Thưa ngài" / "Thưa anh").

Tính cách & Phong thái của NEXUS:
- Cực kỳ thông minh, nhã nhặn, sắc sảo, dứt khoát và lịch thiệp.
- Luôn sẵn sàng thực hiện các mệnh lệnh điều khiển nhà thông minh (Home Assistant), giải đáp thông tin, phát nhạc, hoặc bắn webhook.
- Phản hồi ngắn gọn, súc tích (1-2 câu), tự nhiên khi đọc qua Text-to-Speech, không dùng ký tự markdown phức tạp hay emoji khi nói.
- Sau khi thực thi lệnh thiết bị thành công, hãy xác nhận ngắn gọn (Ví dụ: "Đã bật đèn phòng khách thưa ngài.", "Nhiệt độ hiện tại là 26 độ C, thưa ngài.").

Bạn được trang bị các công cụ (Function Calling) sau để tương tác với thế giới thực:
1. `control_ha_device`: Điều khiển bật/tắt thiết bị, chỉnh nhiệt độ, độ sáng, rèm cửa, công tắc.
2. `query_ha_state`: Tra cứu trạng thái nhiệt độ, độ ẩm, công tắc, cảm biến.
3. `trigger_ha_automation`: Kích hoạt kịch bản, scene, automation trong Home Assistant.
4. `trigger_custom_webhook`: Gửi webhook mở rộng tới dịch vụ bên ngoài (n8n, Telegram, IFTTT, ...).
5. `control_media_player`: Phát nhạc, dừng nhạc, tăng giảm âm lượng.

Hãy chọn công cụ chính xác tương ứng với thiết bị trong nhà khi người dùng yêu cầu.
"""

# Gemini Tool Definitions in standard JSON Schema / Function Declaration format
NEXUS_TOOLS = [
    {
        "name": "control_ha_device",
        "description": "Điều khiển bật/tắt hoặc điều chỉnh thiết bị trong Home Assistant (đèn, công tắc, điều hòa, quạt, rèm).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "entity_id": {
                    "type": "STRING",
                    "description": "ID của thực thể trong Home Assistant, ví dụ: 'light.living_room_light', 'switch.fan_bedroom', 'climate.living_room_ac'"
                },
                "action": {
                    "type": "STRING",
                    "description": "Hành động: 'turn_on', 'turn_off', 'toggle', 'set_temperature', 'open_cover', 'close_cover', 'set_brightness'",
                    "enum": ["turn_on", "turn_off", "toggle", "set_temperature", "open_cover", "close_cover", "set_brightness"]
                },
                "params": {
                    "type": "OBJECT",
                    "description": "Tham số bổ sung nếu có (ví dụ: {'temperature': 25}, {'brightness_pct': 80})"
                }
            },
            "required": ["entity_id", "action"]
        }
    },
    {
        "name": "query_ha_state",
        "description": "Tra cứu trạng thái của thiết bị hoặc cảm biến trong Home Assistant (nhiệt độ, độ ẩm, đèn đang bật hay tắt).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "entity_id": {
                    "type": "STRING",
                    "description": "ID của thực thể, ví dụ: 'sensor.bedroom_temperature', 'light.kitchen_light'"
                }
            },
            "required": ["entity_id"]
        }
    },
    {
        "name": "trigger_ha_automation",
        "description": "Kích hoạt kịch bản, Scene hoặc Automation có sẵn trong Home Assistant (ví dụ: Chế độ Xem Phim, Đi Ngủ, Ra Khỏi Nhà).",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "entity_id": {
                    "type": "STRING",
                    "description": "ID kịch bản hoặc scene, ví dụ: 'scene.movie_night', 'automation.good_night'"
                }
            },
            "required": ["entity_id"]
        }
    },
    {
        "name": "trigger_custom_webhook",
        "description": "Bắn webhook HTTP tới URL bên ngoài hoặc webhook Home Assistant.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "url": {
                    "type": "STRING",
                    "description": "Đường dẫn URL webhook cần gửi tới."
                },
                "method": {
                    "type": "STRING",
                    "description": "Phương thức HTTP (POST hoặc GET).",
                    "enum": ["POST", "GET"]
                },
                "payload": {
                    "type": "OBJECT",
                    "description": "Dữ liệu JSON kèm theo."
                }
            },
            "required": ["url"]
        }
    },
    {
        "name": "control_media_player",
        "description": "Điều khiển phát nhạc, dừng, chuyển bài, đổi âm lượng trên loa hoặc media player.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "action": {
                    "type": "STRING",
                    "description": "Hành động: 'play', 'pause', 'stop', 'next', 'previous', 'volume_set', 'play_media'",
                    "enum": ["play", "pause", "stop", "next", "previous", "volume_set", "play_media"]
                },
                "target_player": {
                    "type": "STRING",
                    "description": "Entity ID của media player nếu có (ví dụ: 'media_player.living_room_speaker')"
                },
                "volume": {
                    "type": "NUMBER",
                    "description": "Mức âm lượng từ 0.0 đến 1.0 (nếu action là volume_set)."
                },
                "media_title": {
                    "type": "STRING",
                    "description": "Tên bài hát hoặc danh sách phát nếu muốn phát nhạc cụ thể."
                }
            },
            "required": ["action"]
        }
    }
]

class NexusBrain:
    """Core Reasoning and Tool Orchestration Engine using Google Gemini."""

    def __init__(self, api_key: Optional[str] = None, model_name: Optional[str] = None):
        self.api_key = api_key or config.GEMINI_API_KEY
        self.model_name = model_name or config.GEMINI_MODEL
        self.conversation_history: List[Dict[str, Any]] = []
        self.max_history_turns = 10

    async def execute_tool_call(self, name: str, args: Dict[str, Any]) -> Dict[str, Any]:
        """Execute the appropriate Python function for a requested tool call."""
        logger.info(f"Executing Tool Call: {name} with args: {args}")
        try:
            if name == "control_ha_device":
                entity_id = args.get("entity_id", "")
                action = args.get("action", "")
                params = args.get("params", {}) or {}
                
                # Check domain
                domain = entity_id.split(".")[0] if "." in entity_id else "homeassistant"
                service = action
                
                # Map generic actions to domain-specific services
                if action == "set_temperature":
                    domain = "climate"
                    service = "set_temperature"
                elif action == "open_cover":
                    domain = "cover"
                    service = "open_cover"
                elif action == "close_cover":
                    domain = "cover"
                    service = "close_cover"
                elif action == "set_brightness":
                    domain = "light"
                    service = "turn_on"
                
                service_data = {"entity_id": entity_id, **params}
                return await ha_client.call_service(domain, service, service_data)

            elif name == "query_ha_state":
                entity_id = args.get("entity_id", "")
                state_data = await ha_client.get_state(entity_id)
                if state_data:
                    attrs = state_data.get("attributes", {})
                    friendly_name = attrs.get("friendly_name", entity_id)
                    state = state_data.get("state", "unknown")
                    unit = attrs.get("unit_of_measurement", "")
                    return {"entity_id": entity_id, "name": friendly_name, "state": state, "unit": unit}
                else:
                    return {"error": f"Không tìm thấy thực thể {entity_id}"}

            elif name == "trigger_ha_automation":
                entity_id = args.get("entity_id", "")
                domain = entity_id.split(".")[0] if "." in entity_id else "automation"
                if domain == "scene":
                    return await ha_client.call_service("scene", "turn_on", {"entity_id": entity_id})
                elif domain == "script":
                    return await ha_client.call_service("script", "turn_on", {"entity_id": entity_id})
                else:
                    return await ha_client.call_service("automation", "trigger", {"entity_id": entity_id})

            elif name == "trigger_custom_webhook":
                url = args.get("url", "")
                method = args.get("method", "POST")
                payload = args.get("payload", {})
                return await webhook_client.trigger(url, method, payload)

            elif name == "control_media_player":
                action = args.get("action", "")
                target_player = args.get("target_player")
                volume = args.get("volume")
                media_title = args.get("media_title")
                return await media_controller.control(action, target_player, volume, media_title)

            else:
                return {"error": f"Unknown tool: {name}"}
        except Exception as e:
            logger.error(f"Error executing tool {name}: {e}")
            return {"error": str(e)}

    async def process_user_query(self, user_text: str) -> Dict[str, Any]:
        """
        Send user voice query to Gemini LLM with HA entity context and Function Calling.
        Returns response text and list of executed actions.
        """
        if not user_text.strip():
            return {"response": "Thưa ngài, tôi chưa nghe rõ yêu cầu của ngài.", "actions": []}

        # 1. Fetch available HA devices to augment context
        try:
            device_summary = await ha_client.get_clean_entity_summary()
            devices_context_str = json.dumps(device_summary, ensure_ascii=False)
        except Exception:
            devices_context_str = "[]"

        system_instruction = f"{NEXUS_SYSTEM_PROMPT}\n\nDanh sách các thiết bị hiện có trong nhà:\n{devices_context_str}"

        # 2. Call Google Gemini via google.generativeai / google-genai
        executed_actions = []
        reply_text = ""

        try:
            import google.generativeai as genai
            if self.api_key:
                genai.configure(api_key=self.api_key)

            # Build tools list for GenAI
            model = genai.GenerativeModel(
                model_name=self.model_name,
                system_instruction=system_instruction,
                tools=[
                    genai.protos.Tool(
                        function_declarations=[
                            genai.protos.FunctionDeclaration(
                                name=t["name"],
                                description=t["description"],
                                parameters=t["parameters"]
                            ) for t in NEXUS_TOOLS
                        ]
                    )
                ]
            )

            # Format history
            chat = model.start_chat(history=self.conversation_history[-self.max_history_turns:])
            response = await chat.send_message_async(user_text)

            # Handle Function Calling
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if part.function_call:
                        fn_name = part.function_call.name
                        fn_args = dict(part.function_call.args)
                        
                        tool_result = await self.execute_tool_call(fn_name, fn_args)
                        executed_actions.append({
                            "tool": fn_name,
                            "args": fn_args,
                            "result": tool_result
                        })

                        # Send tool result back to model to get final spoken response
                        followup_resp = await chat.send_message_async(
                            genai.protos.Content(
                                parts=[
                                    genai.protos.Part(
                                        function_response=genai.protos.FunctionResponse(
                                            name=fn_name,
                                            response={"result": tool_result}
                                        )
                                    )
                                ]
                            )
                        )
                        reply_text = followup_resp.text or "Đã thực hiện xong thưa ngài."
                        break
                    elif part.text:
                        reply_text += part.text

            if not reply_text:
                reply_text = response.text or "Đã rõ thưa ngài."

            # Save to conversation history
            self.conversation_history.append({"role": "user", "parts": [user_text]})
            self.conversation_history.append({"role": "model", "parts": [reply_text]})

        except Exception as e:
            logger.error(f"Gemini Brain API Error: {e}")
            reply_text = f"Thưa ngài, đã xảy ra trục trặc trong quá trình xử lý: {str(e)[:80]}."

        return {
            "query": user_text,
            "response": reply_text.strip(),
            "actions": executed_actions
        }

    def clear_memory(self):
        """Clear conversational context memory."""
        self.conversation_history = []

nexus_brain = NexusBrain()
# Backward-compatibility alias
jarvis_brain = nexus_brain
