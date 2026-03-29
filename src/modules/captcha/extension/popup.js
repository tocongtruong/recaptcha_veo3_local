// ===================================
// POPUP SCRIPT - UI Control
// ===================================

class Logger {
    constructor(context) {
        this.context = context;
    }
    log(message, data = null) {
        if (data) console.log(`[${this.context}] ${message}`, data);
        else console.log(`[${this.context}] ${message}`);
    }
    debug(message, data = null) {
        if (data) console.log(`[${this.context}] ${message}`, data);
        else console.log(`[${this.context}] ${message}`);
    }
    warn(message, data = null) {
        if (data) console.warn(`[${this.context}] ⚠️ ${message}`, data);
        else console.warn(`[${this.context}] ⚠️ ${message}`);
    }
    error(message, data = null) {
        if (data) console.error(`[${this.context}] ❌ ${message}`, data);
        else console.error(`[${this.context}] ❌ ${message}`);
    }
    success(message, data = null) {
        if (data) console.log(`[${this.context}] ✅ ${message}`, data);
        else console.log(`[${this.context}] ✅ ${message}`);
    }
}

const logger = new Logger('PopupUI');

const DEFAULT_SOCKET_SERVER = 'http://localhost:3000';

function normalizeSocketServer(rawValue) {
    const value = (rawValue || '').trim();
    if (!value) {
        return DEFAULT_SOCKET_SERVER;
    }

    const withProtocol = /^(https?:\/\/|wss?:\/\/)/i.test(value)
        ? value
        : `https://${value}`;

    try {
        const url = new URL(withProtocol);
        return url.origin;
    } catch (error) {
        throw new Error('Socket Server URL is invalid. Example: https://my-tunnel.example.com');
    }
}

const elements = {
    enabled: document.getElementById('enabled'),
    autoReload: document.getElementById('autoReload'),
    reloadInterval: document.getElementById('reloadInterval'),
    socketServer: document.getElementById('socketServer'),
    clearGrecaptcha: document.getElementById('clearGrecaptcha'),
    saveSettings: document.getElementById('saveSettings'),
    testConnection: document.getElementById('testConnection'),
    reloadNow: document.getElementById('reloadNow'),
    autoReloadRow: document.getElementById('autoReloadRow'),
    intervalRow: document.getElementById('intervalRow'),
    connectionStatus: document.getElementById('connectionStatus')
};

function setConnectionStatus(type, message) {
    elements.connectionStatus.className = `connection-status show ${type}`;
    elements.connectionStatus.textContent = message;
}

function toSocketHandshakeUrl(baseUrl) {
    const url = new URL(baseUrl);
    const isSecure = url.protocol === 'https:';
    const wsProtocol = isSecure ? 'wss:' : 'ws:';

    return `${wsProtocol}//${url.host}/socket.io/?EIO=4&transport=websocket`;
}

function testSocketConnection(baseUrl, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
        let settled = false;
        let socket = null;

        const finalize = (result, error) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            if (socket && socket.readyState === WebSocket.OPEN) {
                socket.close();
            }
            if (error) reject(error);
            else resolve(result);
        };

        const wsUrl = toSocketHandshakeUrl(baseUrl);

        let timer = setTimeout(() => {
            finalize(null, new Error('Connection timeout (6s).'));
        }, timeoutMs);

        try {
            socket = new WebSocket(wsUrl);
        } catch (error) {
            finalize(null, new Error('Invalid WebSocket URL or blocked by browser policy.'));
            return;
        }

        socket.onmessage = (event) => {
            const payload = String(event.data || '');
            if (payload.startsWith('0{')) {
                finalize({ wsUrl });
            }
        };

        socket.onerror = () => {
            finalize(null, new Error('Could not connect to socket server.'));
        };

        socket.onclose = () => {
            if (!settled) {
                finalize(null, new Error('Socket closed before handshake completed.'));
            }
        };
    });
}

// Load settings khi popup mở
async function loadSettings() {
    const response = await chrome.runtime.sendMessage({ type: 'GET_SETTINGS' });
    logger.log('Loaded settings', response);
    
    elements.enabled.checked = response.enabled;
    elements.autoReload.checked = response.autoReload;
    elements.reloadInterval.value = response.reloadInterval;
    elements.socketServer.value = response.socketServer || DEFAULT_SOCKET_SERVER;
    elements.clearGrecaptcha.checked = response.clearGrecaptcha ?? false;
    
    updateUIState();
}

// Save settings khi thay đổi (chỉ lưu, không reload)
async function saveSettings() {
    const socketServer = normalizeSocketServer(elements.socketServer.value);

    const settings = {
        enabled: elements.enabled.checked,
        autoReload: elements.autoReload.checked,
        reloadInterval: parseInt(elements.reloadInterval.value),
        socketServer,
        clearGrecaptcha: elements.clearGrecaptcha.checked
    };

    elements.socketServer.value = socketServer;
    
    await chrome.runtime.sendMessage({
        type: 'SAVE_SETTINGS',
        settings: settings
    });
    
    logger.success('Settings saved', settings);
}

// Save và reload page
async function saveAndReload() {
    const button = elements.saveSettings;
    const originalHTML = button.innerHTML;
    
    button.innerHTML = '<span>💾</span><span>Saving...</span>';
    button.disabled = true;
    
    try {
        // Save settings
        await saveSettings();
        
        button.innerHTML = '<span>✅</span><span>Saved!</span>';
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate([10, 50, 10]);
        }
        
        // Reload all active tabs
        setTimeout(async () => {
            const tabs = await chrome.tabs.query({ active: true });
            for (const tab of tabs) {
                try {
                    await chrome.tabs.reload(tab.id);
                } catch (error) {
                    logger.error('Failed to reload tab', error);
                }
            }
            
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 1000);
    } catch (error) {
        logger.error('Save failed', error);
        button.innerHTML = '<span>❌</span><span>Error</span>';

        if (error?.message) {
            alert(error.message);
        }
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 2000);
    }
}

// Update UI state dựa vào settings
function updateUIState() {
    const enabled = elements.enabled.checked;
    const autoReload = elements.autoReload.checked;
    
    // Disable/enable controls
    elements.autoReload.disabled = !enabled;
    elements.reloadInterval.disabled = !enabled || !autoReload;
    
    // Visual feedback
    if (!enabled) {
        elements.autoReloadRow.classList.add('disabled');
        elements.intervalRow.classList.add('disabled');
    } else {
        elements.autoReloadRow.classList.remove('disabled');
        
        if (autoReload) {
            elements.intervalRow.classList.remove('disabled');
        } else {
            elements.intervalRow.classList.add('disabled');
        }
    }
}

// Event listeners - Chỉ update UI, không save
elements.enabled.addEventListener('change', () => {
    updateUIState();
    
    // Add haptic feedback
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
});

elements.autoReload.addEventListener('change', () => {
    updateUIState();
    
    if (navigator.vibrate) {
        navigator.vibrate(10);
    }
});

// Save & Reload button
elements.saveSettings.addEventListener('click', async () => {
    await saveAndReload();
});

elements.testConnection.addEventListener('click', async () => {
    const button = elements.testConnection;
    const originalHTML = button.innerHTML;

    button.innerHTML = '<span>⏳</span><span>Testing...</span>';
    button.disabled = true;

    try {
        const socketServer = normalizeSocketServer(elements.socketServer.value);
        elements.socketServer.value = socketServer;

        setConnectionStatus('info', 'Testing socket handshake...');
        await testSocketConnection(socketServer);
        setConnectionStatus('success', 'Connected successfully. Socket server is reachable.');
        logger.success('Socket test passed', { socketServer });
    } catch (error) {
        setConnectionStatus('error', `Connection failed: ${error.message}`);
        logger.error('Socket test failed', error);
    } finally {
        button.innerHTML = originalHTML;
        button.disabled = false;
    }
});

elements.reloadNow.addEventListener('click', async () => {
    const button = elements.reloadNow;
    const originalHTML = button.innerHTML;
    
    button.innerHTML = '<span>⏳</span><span>Reloading...</span>';
    button.disabled = true;
    
    try {
        await chrome.runtime.sendMessage({ type: 'RELOAD_NOW' });
        
        button.innerHTML = '<span>✅</span><span>Reloaded!</span>';
        
        // Haptic feedback
        if (navigator.vibrate) {
            navigator.vibrate([10, 50, 10]);
        }
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 2000);
    } catch (error) {
        button.innerHTML = '<span>❌</span><span>Error</span>';
        
        setTimeout(() => {
            button.innerHTML = originalHTML;
            button.disabled = false;
        }, 2000);
    }
});

// Validate interval input
elements.reloadInterval.addEventListener('input', (e) => {
    let value = parseInt(e.target.value);
    if (isNaN(value) || value < 1) {
        e.target.value = 1;
    } else if (value > 60) {
        e.target.value = 60;
    }
});

elements.socketServer.addEventListener('blur', () => {
    try {
        elements.socketServer.value = normalizeSocketServer(elements.socketServer.value);
    } catch (error) {
        logger.warn('Socket server URL is not valid yet');
    }
});

// Prevent non-numeric input
elements.reloadInterval.addEventListener('keydown', (e) => {
    // Allow: backspace, delete, tab, escape, enter
    if ([46, 8, 9, 27, 13].indexOf(e.keyCode) !== -1 ||
        // Allow: Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X
        (e.keyCode === 65 && e.ctrlKey === true) ||
        (e.keyCode === 67 && e.ctrlKey === true) ||
        (e.keyCode === 86 && e.ctrlKey === true) ||
        (e.keyCode === 88 && e.ctrlKey === true) ||
        // Allow: home, end, left, right
        (e.keyCode >= 35 && e.keyCode <= 39)) {
        return;
    }
    // Ensure that it is a number and stop the keypress
    if ((e.shiftKey || (e.keyCode < 48 || e.keyCode > 57)) && (e.keyCode < 96 || e.keyCode > 105)) {
        e.preventDefault();
    }
});

// Initialize
loadSettings();