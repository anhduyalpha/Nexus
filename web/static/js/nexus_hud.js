/**
 * NEXUS HUD Frontend Logic & WebSocket Coordinator
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const statusPill = document.getElementById('status-pill');
    const statusText = document.getElementById('status-text');
    const statusSubtext = document.getElementById('status-subtext');
    const coreStateIcon = document.getElementById('core-state-icon');
    const conversationFeed = document.getElementById('conversation-feed');
    const inputCommand = document.getElementById('input-command');
    const btnSendCommand = document.getElementById('btn-send-command');
    const btnToggleMic = document.getElementById('btn-toggle-mic');
    const btnMicText = document.getElementById('btn-mic-text');
    const btnTestChime = document.getElementById('btn-test-chime');
    const btnClearFeed = document.getElementById('btn-clear-feed');
    const btnRefreshDevices = document.getElementById('btn-refresh-devices');
    const devicesGrid = document.getElementById('devices-grid');
    const deviceCount = document.getElementById('device-count');
    const haStatusBadge = document.getElementById('ha-status-badge');

    // Modals
    const modalSettings = document.getElementById('modal-settings');
    const btnOpenSettings = document.getElementById('btn-open-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const formSettings = document.getElementById('form-settings');

    const modalWebhook = document.getElementById('modal-webhook');
    const btnOpenWebhook = document.getElementById('btn-open-webhook');
    const btnCloseWebhook = document.getElementById('btn-close-webhook');
    const formWebhook = document.getElementById('form-webhook');
    const webhookResult = document.getElementById('webhook-result');

    // Audio Visualizer Canvas Setup
    const canvas = document.getElementById('audio-visualizer-canvas');
    const ctx = canvas.getContext('2d');
    let currentAudioLevel = 0.05;
    let targetAudioLevel = 0.05;
    let visualizerAngle = 0;

    let ws = null;
    let devicesCache = [];
    let currentDeviceFilter = 'all';

    // State Configuration
    const stateMap = {
        'IDLE': { text: 'SYSTEM IDLE', icon: '💤', sub: 'Nexus is standing by' },
        'LISTENING_WAKE': { text: 'LISTENING FOR "HEY NEXUS"', icon: '⚡', sub: 'Microphone online // VAD Active' },
        'WAKE_DETECTED': { text: 'NEXUS AWAKENED', icon: '✨', sub: 'Processing wake trigger...' },
        'RECORDING': { text: 'CAPTURING VOICE...', icon: '🎙️', sub: 'Listening to user command...' },
        'TRANSCRIBING': { text: 'TRANSCRIBING SPEECH', icon: '📝', sub: 'Faster-Whisper local STT...' },
        'THINKING': { text: 'ANALYZING INTENT', icon: '🧠', sub: 'Gemini 2.0 Flash NLU reasoning...' },
        'EXECUTING': { text: 'EXECUTING ACTIONS', icon: '⚙️', sub: 'Dispatching Home Assistant / Webhooks...' },
        'SPEAKING': { text: 'NEXUS SPEAKING', icon: '🔊', sub: 'Edge-TTS Neural Audio output...' }
    };

    function updateStateUI(stateName) {
        const info = stateMap[stateName] || { text: stateName, icon: '⚡', sub: '' };
        statusText.textContent = info.text;
        coreStateIcon.textContent = info.icon;
        if (info.sub) statusSubtext.textContent = info.sub;

        // Visual effects
        if (stateName === 'RECORDING' || stateName === 'WAKE_DETECTED') {
            targetAudioLevel = 0.6;
        } else if (stateName === 'SPEAKING') {
            targetAudioLevel = 0.8;
        } else if (stateName === 'THINKING') {
            targetAudioLevel = 0.3;
        } else {
            targetAudioLevel = 0.05;
        }
    }

    // Connect WebSocket
    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("[NEXUS HUD] WebSocket connected.");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWsMessage(data);
            } catch (e) {
                console.error("WS Parse error:", e);
            }
        };

        ws.onclose = () => {
            console.warn("[NEXUS HUD] WebSocket disconnected. Reconnecting in 3s...");
            setTimeout(connectWebSocket, 3000);
        };
    }

    function handleWsMessage(msg) {
        if (msg.type === 'init_state') {
            updateStateUI(msg.state);
            updateMuteUI(msg.is_muted);
            updateHAStatus(msg.ha_status);
            if (msg.satellite_status) {
                updateSatelliteUI(msg.satellite_status);
            }
        } else if (msg.type === 'state_change') {
            updateStateUI(msg.data.state);
        } else if (msg.type === 'audio_level') {
            targetAudioLevel = Math.min(1.0, msg.data.rms * 5.0);
        } else if (msg.type === 'conversation_turn') {
            appendConversationTurn(msg.data.user_text, msg.data.response_text, msg.data.actions);
        } else if (msg.type === 'mute_status') {
            updateMuteUI(msg.is_muted);
        } else if (msg.type === 'satellite_status') {
            updateSatelliteUI(msg);
        } else if (msg.type === 'satellite_audio_level') {
            handleSatelliteAudioLevel(msg.rms);
        } else if (msg.type === 'satellite_test_result') {
            handleSatelliteTestResult(msg);
        }
    }

    function updateSatelliteUI(data) {
        const satBadge = document.getElementById('satellite-status-badge');
        if (!satBadge) return;
        if (data.connected) {
            satBadge.textContent = `🟢 ONLINE (${data.name || 'Linux Server'})`;
            satBadge.style.color = 'var(--green-glow)';
            satBadge.classList.add('text-glow-cyan');
        } else {
            satBadge.textContent = 'CHƯA KẾT NỐI';
            satBadge.style.color = '#ff5c8a';
            satBadge.classList.remove('text-glow-cyan');
        }
    }

    function updateMuteUI(isMuted) {
        if (isMuted) {
            btnMicText.textContent = 'Unmute Mic';
            btnToggleMic.style.borderColor = 'var(--red-glow)';
            statusText.textContent = 'MICROPHONE MUTED';
        } else {
            btnMicText.textContent = 'Mute Mic';
            btnToggleMic.style.borderColor = 'var(--border-hud)';
        }
    }

    function updateHAStatus(haStatus) {
        if (haStatus && haStatus.status === 'ok') {
            haStatusBadge.textContent = 'ONLINE (CONNECTED)';
            haStatusBadge.style.color = 'var(--green-glow)';
        } else {
            haStatusBadge.textContent = 'OFFLINE / NO TOKEN';
            haStatusBadge.style.color = 'var(--red-glow)';
        }
    }

    // Append Conversation Turn
    function appendConversationTurn(userText, responseText, actions = []) {
        const timeStr = new Date().toLocaleTimeString();

        // 1. User message
        const userItem = document.createElement('div');
        userItem.className = 'feed-item user-msg';
        userItem.innerHTML = `
            <div class="msg-avatar">SIR</div>
            <div class="msg-content">
                <p>${escapeHtml(userText)}</p>
                <span class="msg-timestamp">${timeStr}</span>
            </div>
        `;
        conversationFeed.appendChild(userItem);

        // 2. Nexus Response with Tool badges
        const nexusItem = document.createElement('div');
        nexusItem.className = 'feed-item nexus-msg';
        
        let toolBadgesHtml = '';
        if (actions && actions.length > 0) {
            actions.forEach(a => {
                toolBadgesHtml += `<div class="tool-badge">⚡ ${escapeHtml(a.tool)}: ${escapeHtml(JSON.stringify(a.args))}</div>`;
            });
        }

        nexusItem.innerHTML = `
            <div class="msg-avatar">NEXUS</div>
            <div class="msg-content">
                <p>${escapeHtml(responseText)}</p>
                ${toolBadgesHtml}
                <span class="msg-timestamp">${timeStr}</span>
            </div>
        `;
        conversationFeed.appendChild(nexusItem);
        conversationFeed.scrollTop = conversationFeed.scrollHeight;

        // Auto refresh devices after action execution
        if (actions && actions.length > 0) {
            setTimeout(fetchDevices, 1000);
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/[&<>"']/g, function (m) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
        });
    }

    // Send Command Handlers
    function sendCommand() {
        const text = inputCommand.value.trim();
        if (!text) return;
        
        inputCommand.value = '';
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'send_command', text: text }));
        } else {
            fetch('/api/command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: text })
            });
        }
    }

    btnSendCommand.addEventListener('click', sendCommand);
    inputCommand.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') sendCommand();
    });

    btnToggleMic.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'toggle_mute' }));
        }
    });

    btnTestChime.addEventListener('click', () => {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: 'play_chime', chime: 'wake' }));
        }
    });

    btnClearFeed.addEventListener('click', () => {
        conversationFeed.innerHTML = '';
    });

    // Devices Management
    async function fetchDevices() {
        try {
            const resp = await fetch('/api/devices');
            const data = await resp.json();
            devicesCache = data.devices || [];
            deviceCount.textContent = devicesCache.length;
            renderDevices();
        } catch (e) {
            devicesGrid.innerHTML = `<div class="device-loading">Chưa thể tải danh sách thiết bị (${e.message})</div>`;
        }
    }

    function renderDevices() {
        devicesGrid.innerHTML = '';
        const filtered = devicesCache.filter(d => {
            if (currentDeviceFilter === 'all') return true;
            return d.domain === currentDeviceFilter;
        });

        if (filtered.length === 0) {
            devicesGrid.innerHTML = '<div class="device-loading">Không có thiết bị trong danh mục này.</div>';
            return;
        }

        filtered.forEach(device => {
            const card = document.createElement('div');
            card.className = 'device-card';
            const isOn = device.state.toLowerCase().includes('on') || (!device.state.toLowerCase().includes('off') && !device.state.toLowerCase().includes('unknown'));

            card.innerHTML = `
                <div class="device-header">
                    <div>
                        <div class="device-name">${escapeHtml(device.name)}</div>
                        <div class="device-id">${escapeHtml(device.entity_id)}</div>
                    </div>
                </div>
                <div class="device-footer">
                    <span class="device-state-badge ${isOn ? 'state-on' : ''}">${escapeHtml(device.state)}</span>
                    <button class="btn-toggle-device" data-id="${device.entity_id}" data-domain="${device.domain}">
                        ${isOn ? 'TẮT' : 'BẬT'}
                    </button>
                </div>
            `;

            card.querySelector('.btn-toggle-device').addEventListener('click', async (e) => {
                const entityId = e.target.getAttribute('data-id');
                const domain = e.target.getAttribute('data-domain');
                await fetch('/api/devices/control', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ entity_id: entityId, action: 'toggle' })
                });
                setTimeout(fetchDevices, 600);
            });

            devicesGrid.appendChild(card);
        });
    }

    // Tabs filter
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentDeviceFilter = btn.getAttribute('data-filter');
            renderDevices();
        });
    });

    btnRefreshDevices.addEventListener('click', fetchDevices);

    // Modals Handling
    btnOpenSettings.addEventListener('click', async () => {
        const resp = await fetch('/api/settings');
        const settings = await resp.json();
        document.getElementById('setting-ha-url').value = settings.ha_url || '';
        if (document.getElementById('setting-llm-provider')) {
            document.getElementById('setting-llm-provider').value = settings.llm_provider || 'gemini';
        }
        document.getElementById('setting-gemini-model').value = settings.gemini_model || 'gemini-1.5-flash';
        document.getElementById('setting-tts-voice').value = settings.tts_voice || 'vi-VN-NamMinhNeural';
        document.getElementById('setting-wake-threshold').value = settings.wake_threshold || 0.5;
        modalSettings.classList.add('open');
    });

    btnCloseSettings.addEventListener('click', () => modalSettings.classList.remove('open'));

    formSettings.addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
            ha_url: document.getElementById('setting-ha-url').value.trim(),
            ha_token: document.getElementById('setting-ha-token').value.trim(),
            gemini_api_key: document.getElementById('setting-gemini-key').value.trim(),
            gemini_model: document.getElementById('setting-gemini-model').value,
            llm_provider: document.getElementById('setting-llm-provider') ? document.getElementById('setting-llm-provider').value : 'gemini',
            tts_voice: document.getElementById('setting-tts-voice').value,
            wake_threshold: parseFloat(document.getElementById('setting-wake-threshold').value)
        };

        const resp = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (resp.ok) {
            alert("Đã lưu cấu hình thành công!");
            modalSettings.classList.remove('open');
            fetchDevices();
        }
    });

    btnOpenWebhook.addEventListener('click', () => modalWebhook.classList.add('open'));
    btnCloseWebhook.addEventListener('click', () => modalWebhook.classList.remove('open'));

    formWebhook.addEventListener('submit', async (e) => {
        e.preventDefault();
        const url = document.getElementById('webhook-url').value.trim();
        const method = document.getElementById('webhook-method').value;
        let payload = {};
        try {
            const rawPayload = document.getElementById('webhook-payload').value.trim();
            if (rawPayload) payload = JSON.parse(rawPayload);
        } catch (err) {
            alert("Payload JSON không hợp lệ.");
            return;
        }

        webhookResult.style.display = 'block';
        webhookResult.textContent = 'Đang gửi webhook...';

        const resp = await fetch('/api/webhook/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, method, payload })
        });
        const resData = await resp.json();
        webhookResult.textContent = JSON.stringify(resData, null, 2);
    });

    // =========================================================
    // Microphone Diagnostic Modal Logic (Linux Server Satellite)
    // =========================================================
    const modalMicTest = document.getElementById('modal-mic-test');
    const btnOpenMicTest = document.getElementById('btn-open-mic-test');
    const btnCloseMicTest = document.getElementById('btn-close-mic-test');
    const btnMicRecordTest = document.getElementById('btn-mic-record-test');
    const btnMicPlayTest = document.getElementById('btn-mic-play-test');
    const micMeterBar = document.getElementById('mic-meter-bar');
    const micLiveDb = document.getElementById('mic-live-db');
    const micSttStatus = document.getElementById('mic-stt-status');
    const micSttResult = document.getElementById('mic-stt-result');
    const micTestCanvas = document.getElementById('mic-test-canvas');
    const micTestCtx = micTestCanvas ? micTestCanvas.getContext('2d') : null;

    let lastRecordedServerAudioUrl = null;
    let isWaitingServerTest = false;

    // Handle live audio telemetry coming from Linux Server
    function handleSatelliteAudioLevel(rms) {
        // Also drive the central Arc Reactor visualizer
        targetAudioLevel = Math.min(1.0, Math.max(targetAudioLevel, rms * 6.0));

        if (!modalMicTest || !modalMicTest.classList.contains('open')) return;
        const pct = Math.min(100, Math.round(rms * 450));

        if (micMeterBar) micMeterBar.style.width = `${pct}%`;
        if (micLiveDb) {
            micLiveDb.textContent = `${pct}% (Tín hiệu Micro: ${pct > 15 ? 'Rõ ràng 🟢' : 'Im lặng / Yên tĩnh ⚪'})`;
        }

        // Draw live canvas waveform
        if (micTestCtx && micTestCanvas) {
            micTestCtx.fillStyle = 'rgba(0, 8, 18, 0.3)';
            micTestCtx.fillRect(0, 0, micTestCanvas.width, micTestCanvas.height);

            const h = (pct / 100) * micTestCanvas.height;
            micTestCtx.fillStyle = pct > 60 ? '#ffb703' : '#00f0ff';
            micTestCtx.fillRect(micTestCanvas.width / 2 - 20, micTestCanvas.height - h, 40, h);
        }
    }

    // Handle diagnostic result from Linux Server
    function handleSatelliteTestResult(data) {
        isWaitingServerTest = false;
        if (btnMicRecordTest) {
            btnMicRecordTest.disabled = false;
            btnMicRecordTest.innerHTML = '<span class="btn-icon">🎙️</span> YÊU CẦU SERVER THU ÂM (5 GIÂY)';
        }

        if (data.text) {
            if (micSttStatus) micSttStatus.textContent = "DỊCH THÀNH CÔNG!";
            if (micSttResult) micSttResult.innerHTML = `<strong class="text-glow-cyan" style="font-size: 1.15rem;">"${data.text}"</strong>`;
        } else {
            if (micSttStatus) micSttStatus.textContent = "KHÔNG CÓ TIẾNG NÓI";
            if (micSttResult) micSttResult.innerHTML = '<em>Không nhận diện được từ ngữ. Hãy nói to hơn và gần Micro server hơn.</em>';
        }

        if (data.audio_url) {
            lastRecordedServerAudioUrl = data.audio_url;
            if (btnMicPlayTest) {
                btnMicPlayTest.disabled = false;
            }
        }
    }

    if (btnOpenMicTest) {
        btnOpenMicTest.addEventListener('click', () => {
            modalMicTest.classList.add('open');
            if (micLiveDb) micLiveDb.textContent = "Đang kết nối nhận tín hiệu âm lượng từ Server...";
        });
    }

    if (btnCloseMicTest) {
        btnCloseMicTest.addEventListener('click', () => {
            modalMicTest.classList.remove('open');
        });
    }

    if (btnMicRecordTest) {
        btnMicRecordTest.addEventListener('click', async () => {
            if (isWaitingServerTest) return;
            isWaitingServerTest = true;
            btnMicRecordTest.disabled = true;
            if (btnMicPlayTest) btnMicPlayTest.disabled = true;

            if (micSttStatus) micSttStatus.textContent = "ĐANG THU ÂM TỪ SERVER LINUX...";
            if (micSttResult) micSttResult.innerHTML = '<span class="text-glow-gold">Đang kích hoạt Micro trên Server Linux. Hãy nói một câu vào Micro Server ngay bây giờ! (5 giây)...</span>';

            // Send command to backend
            try {
                const resp = await fetch('/api/satellite/test', { method: 'POST' });
                const resData = await resp.json();
                if (!resp.ok) {
                    alert(resData.message || "Lỗi: Chưa có Microphone vệ tinh nào kết nối!");
                    isWaitingServerTest = false;
                    btnMicRecordTest.disabled = false;
                    btnMicRecordTest.innerHTML = '<span class="btn-icon">🎙️</span> YÊU CẦU SERVER THU ÂM (5 GIÂY)';
                    return;
                }
            } catch (err) {
                alert("Lỗi khi gửi lệnh thu âm tới Server: " + err.message);
                isWaitingServerTest = false;
                btnMicRecordTest.disabled = false;
                return;
            }

            // Count down 5 seconds on button
            let secondsLeft = 5;
            btnMicRecordTest.innerHTML = `<span class="btn-icon">🔴</span> SERVER ĐANG GHI ÂM (${secondsLeft}s)...`;
            const interval = setInterval(() => {
                secondsLeft--;
                if (secondsLeft > 0) {
                    btnMicRecordTest.innerHTML = `<span class="btn-icon">🔴</span> SERVER ĐANG GHI ÂM (${secondsLeft}s)...`;
                } else {
                    clearInterval(interval);
                    btnMicRecordTest.innerHTML = `<span class="btn-icon">⚡</span> WHISPER GPU ĐANG XỬ LÝ...`;
                    if (micSttStatus) micSttStatus.textContent = "WHISPER GPU ĐANG DỊCH...";
                }
            }, 1000);
        });
    }

    if (btnMicPlayTest) {
        btnMicPlayTest.addEventListener('click', () => {
            if (lastRecordedServerAudioUrl) {
                const audio = new Audio(lastRecordedServerAudioUrl);
                audio.play();
            }
        });
    }

    if (btnMicPlayTest) {
        btnMicPlayTest.addEventListener('click', () => {
            if (recordedAudioUrl) {
                const audio = new Audio(recordedAudioUrl);
                audio.play();
            }
        });
    }

    // Arc Reactor Audio Visualizer Loop
    function drawVisualizer() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;

        // Smooth audio level interpolation
        currentAudioLevel += (targetAudioLevel - currentAudioLevel) * 0.15;
        if (targetAudioLevel > 0.05) targetAudioLevel *= 0.96;

        visualizerAngle += 0.02;

        const baseRadius = 55;
        const numPoints = 64;

        ctx.save();
        ctx.translate(cx, cy);

        // Circular wave
        ctx.beginPath();
        for (let i = 0; i <= numPoints; i++) {
            const theta = (i / numPoints) * Math.PI * 2;
            const wave = Math.sin(theta * 8 + visualizerAngle * 4) * (currentAudioLevel * 25);
            const r = baseRadius + wave;
            const x = r * Math.cos(theta);
            const y = r * Math.sin(theta);
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(0, 240, 255, ${0.4 + currentAudioLevel * 0.6})`;
        ctx.lineWidth = 2 + currentAudioLevel * 3;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 10 + currentAudioLevel * 20;
        ctx.stroke();

        ctx.restore();
        requestAnimationFrame(drawVisualizer);
    }

    // Start all
    connectWebSocket();
    fetchDevices();
    drawVisualizer();
});
