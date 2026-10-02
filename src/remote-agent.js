'use strict';

const { execFileSync } = require('node:child_process');
const WebSocket = require('ws');

function persistedEnv(name) {
  if (process.env[name]) return process.env[name];
  if (process.platform !== 'win32') return '';
  try {
    const text = execFileSync('reg.exe', ['query', 'HKCU\\Environment', '/v', name], {
      encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore']
    });
    const line = text.split(/\r?\n/).find((row) => row.includes(name));
    if (!line) return '';
    const match = line.match(/REG_(?:EXPAND_)?SZ\s+(.+)$/i);
    return match ? match[1].trim() : '';
  } catch {
    return '';
  }
}

function wsUrl(baseUrl, agentId) {
  let base = String(baseUrl || '').replace(/\/+$/, '');
  if (base.startsWith('https://')) base = 'wss://' + base.slice(8);
  else if (base.startsWith('http://')) base = 'ws://' + base.slice(7);
  if (!/^wss?:\/\//.test(base)) throw new Error('control URL must be HTTP(S) or WS(S)');
  return `${base}/ws?agent_id=${encodeURIComponent(agentId)}`;
}

class RemoteAgent {
  constructor(controller, onUpdate = () => {}) {
    this.controller = controller;
    this.onUpdate = onUpdate;
    const hardfireUrl = persistedEnv('HARDFIRE_CONTROL_URL');
    const cloudflareUrl = persistedEnv('CF_CONTROL_URL');
    const firetraceUrl = persistedEnv('FIRETRACE_CONTROL_URL');
    const explicitHardFireAgentId = persistedEnv('HARDFIRE_AGENT_ID');
    const legacyFiretraceAgentId = persistedEnv('FIRETRACE_AGENT_ID');

    this.baseUrl = hardfireUrl || cloudflareUrl || firetraceUrl;
    this.token = persistedEnv('HARDFIRE_CONTROL_TOKEN') || persistedEnv('CF_CONTROL_TOKEN') || persistedEnv('FIRETRACE_CONTROL_TOKEN');
    this.agentId =
      explicitHardFireAgentId ||
      legacyFiretraceAgentId ||
      (hardfireUrl ? 'hardfire' : (cloudflareUrl || firetraceUrl) ? 'firetrace' : 'hardfire');
    this.socket = null;
    this.stopped = false;
    this.connected = false;
    this.lastError = '';
    this.retryMs = 1000;
    this.timer = null;
    this.heartbeat = null;
  }

  state() {
    return {
      enabled: Boolean(this.baseUrl && this.token),
      connected: this.connected,
      agentId: this.agentId,
      baseUrl: this.baseUrl || '',
      error: this.lastError
    };
  }

  start() {
    if (!this.baseUrl || !this.token || this.stopped) {
      this.onUpdate();
      return;
    }
    this._connect();
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.timer = null;
    this.heartbeat = null;
    try { this.socket?.close(); } catch {}
  }

  _schedule() {
    if (this.stopped || this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      this._connect();
    }, this.retryMs);
    this.retryMs = Math.min(Math.round(this.retryMs * 1.7), 15000);
  }

  async _sendState(commandId = null) {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;
    try {
      this._sendJson({
        type: 'state',
        agent_id: this.agentId,
        command_id: commandId,
        state: await this.controller.status(),
        ts: Date.now() / 1000
      });
    } catch (error) {
      this._sendJson({
        type: 'event',
        event: 'state_error',
        payload: { error: String(error?.message || error) }
      });
    }
  }

  _sendJson(value) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(value));
    }
  }

  _sendScreenshot(commandId, bytes, quality) {
    const header = Buffer.from(JSON.stringify({
      type: 'screenshot',
      agent_id: this.agentId,
      command_id: commandId,
      mime: 'image/jpeg',
      quality,
      ts: Date.now()
    }));
    const prefix = Buffer.allocUnsafe(4);
    prefix.writeUInt32BE(header.length, 0);
    this.socket.send(Buffer.concat([prefix, header, bytes]));
  }

  async _handle(command) {
    const id = String(command?.id || '');
    const rawAction = String(command?.action || '');
    const args = command?.args || {};
    const started = Date.now() / 1000;

    this._sendJson({ type: 'started', id, action: rawAction, started_at: started });

    try {
      const result = await this.controller.execute(rawAction, args);
      let publicResult = result;
      if (rawAction === 'screenshot' || rawAction === 'browser_screenshot') {
        this._sendScreenshot(id, result.bytes, result.quality);
        publicResult = { bytes: result.bytes.length, quality: result.quality, uploaded: true };
      } else if (result?.screenshot?.base64) {
        const bytes = Buffer.from(result.screenshot.base64, 'base64');
        this._sendScreenshot(id, bytes, result.screenshot.quality || 70);
        publicResult = { ...result, screenshot: { bytes: bytes.length, quality: result.screenshot.quality || 70, uploaded: true } };
      }

      this._sendJson({
        type: 'result', id, action: rawAction, ok: true, result: publicResult,
        started_at: started, finished_at: Date.now() / 1000
      });
    } catch (error) {
      this._sendJson({
        type: 'result', id, action: rawAction, ok: false,
        error: `${error?.name || 'Error'}: ${error?.message || error}`,
        started_at: started, finished_at: Date.now() / 1000
      });
    }

    await this._sendState(id);
  }

  _connect() {
    if (this.stopped) return;
    let url;
    try { url = wsUrl(this.baseUrl, this.agentId); }
    catch (error) {
      this.lastError = error.message;
      this.onUpdate();
      return;
    }

    const socket = new WebSocket(url, {
      headers: { 'X-Control-Token': this.token },
      maxPayload: 16 * 1024 * 1024
    });
    this.socket = socket;

    socket.on('open', async () => {
      this.connected = true;
      this.lastError = '';
      this.retryMs = 1000;
      this.onUpdate();
      this._sendJson({
        type: 'hello', agent_id: this.agentId, ts: Date.now() / 1000,
        version: '1.4.1', transport: 'hardfire-cloudflare-wss',
        backend: 'hard-browser-electron-cdp'
      });
      await this._sendState();
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = setInterval(async () => {
        this._sendJson({ type: 'hello', agent_id: this.agentId, ts: Date.now() / 1000, version: '1.4.1', transport: 'hardfire-cloudflare-wss' });
        await this._sendState();
      }, 10000);
    });

    socket.on('message', (data, isBinary) => {
      if (isBinary) return;
      try {
        const msg = JSON.parse(String(data));
        if (msg?.type === 'command' && msg.command) void this._handle(msg.command);
      } catch {}
    });

    const disconnected = (error) => {
      if (this.socket === socket) this.socket = null;
      this.connected = false;
      if (this.heartbeat) clearInterval(this.heartbeat);
      this.heartbeat = null;
      if (error) this.lastError = String(error?.message || error);
      this.onUpdate();
      this._schedule();
    };
    socket.on('error', disconnected);
    socket.on('close', () => disconnected());
  }
}

module.exports = { RemoteAgent, persistedEnv, wsUrl };
