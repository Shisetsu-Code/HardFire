'use strict';

const { HarRecorder } = require('./har-recorder');
const { headersArrayToObject } = require('./redact');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class HardFireController {
  constructor(options) {
    this.getActiveTab = options.getActiveTab;
    this.createTab = options.createTab;
    this.activateTab = options.activateTab;
    this.networkTap = options.networkTap;
    this.lastCapture = [];
  }

  _tab() {
    let tab = this.getActiveTab?.();
    if (!tab || tab.kind !== 'game') {
      tab = this.createTab?.('about:blank');
    }
    if (!tab || tab.kind !== 'game') {
      throw new Error('No game browser tab is available');
    }
    return tab;
  }

  _wc(tab = this._tab()) {
    const wc = tab?.view?.webContents;
    if (!wc || wc.isDestroyed()) throw new Error('Browser tab is closed');
    return wc;
  }

  async _send(tab, method, params = {}) {
    const wc = this._wc(tab);
    const dbg = wc.debugger;
    if (!dbg.isAttached()) dbg.attach();
    return dbg.sendCommand(method, params);
  }

  async status() {
    const tab = this._tab();
    const wc = this._wc(tab);
    let bounds = { width: 0, height: 0 };
    try { bounds = tab.view.getBounds(); } catch {}
    return {
      backend: 'hard-browser-electron-cdp',
      connected: true,
      tab_id: tab.id,
      url: wc.getURL() || tab.url || 'about:blank',
      title: wc.getTitle() || tab.title || '',
      viewport: { width: bounds.width || 0, height: bounds.height || 0 },
      recording: Boolean(tab.recorder?.recording),
      speed: tab.speed || 1,
      muted: Boolean(tab.muted),
      ws: tab.recorder?.getStats?.().wsFrames || 0
    };
  }

  async open(url) {
    const tab = this._tab();
    const wc = this._wc(tab);
    await wc.loadURL(String(url));
    return { url: wc.getURL() || String(url), tab_id: tab.id };
  }

  async wait(ms = 1000) {
    const value = Math.max(0, Math.min(Number(ms) || 0, 60000));
    await delay(value);
    return { waited_ms: value };
  }

  async click(x, y) {
    const tab = this._tab();
    const px = Number(x);
    const py = Number(y);
    if (!Number.isFinite(px) || !Number.isFinite(py)) {
      throw new Error('x and y must be finite numbers');
    }
    await this._send(tab, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1
    });
    await this._send(tab, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1
    });
    return { x: px, y: py };
  }

  async clickRelative(rx, ry) {
    const tab = this._tab();
    const bounds = tab.view.getBounds();
    const nrx = Number(rx);
    const nry = Number(ry);
    if (!Number.isFinite(nrx) || !Number.isFinite(nry) || nrx < 0 || nrx > 1 || nry < 0 || nry > 1) {
      throw new Error('rx and ry must be between 0 and 1');
    }
    const x = Math.max(0, bounds.width * nrx);
    const y = Math.max(0, bounds.height * nry);
    await this.click(x, y);
    return { x, y, width: bounds.width, height: bounds.height };
  }

  async screenshot(quality = 65) {
    const wc = this._wc();
    const image = await wc.capturePage();
    const q = Math.max(20, Math.min(Number(quality) || 65, 90));
    return image.toJPEG(q);
  }

  networkClear() {
    this.lastCapture = [];
    return { cleared: true };
  }

  networkEvents() {
    return { events: this.lastCapture };
  }

  _captureFromEntry(entry) {
    return {
      url: entry.request?.url || '',
      method: entry.request?.method || '',
      headers: headersArrayToObject(entry.request?.headers),
      postData: entry.request?.postData?.text ?? null,
      status: entry.response?.status ?? 0,
      responseHeaders: headersArrayToObject(entry.response?.headers),
      responseBody: entry.response?.content?.text ?? null,
      base64Encoded: entry.response?.content?.encoding === 'base64',
      bodyError: entry.response?.content?._bodyCaptureError || null,
      webSocketFrames: entry._webSocketFrames || [],
      webSocketTransactions: entry._webSocketTransactions || []
    };
  }

  async triggerAndCapture({
    url_contains = 'fn=play',
    x = null,
    y = null,
    rx = null,
    ry = null,
    wait_ms = 2500
  } = {}) {
    const tab = this._tab();
    const wc = this._wc(tab);
    if (tab.recorder?.recording) {
      throw new Error('Manual HAR REC is active; stop it before trigger_and_capture');
    }

    const recorder = new HarRecorder(wc, {
      networkTap: this.networkTap(),
      gameOnly: true,
      cdpSessionsProvider: () => tab.runtimeController?.getSessionIds?.() || [],
      webSocketSnapshotProvider: () => tab.runtimeController?.getWebSocketSnapshot?.() || []
    });

    await recorder.start();
    try {
      if (x !== null && y !== null) {
        await this.click(Number(x), Number(y));
      } else if (rx !== null && ry !== null) {
        await this.clickRelative(Number(rx), Number(ry));
      } else {
        throw new Error('provide x/y or rx/ry');
      }

      await delay(Math.max(0, Math.min(Number(wait_ms) || 0, 30000)));
      const har = await recorder.stop();
      const filter = String(url_contains || '');
      const entries = har.log?.entries || [];
      const matched = entries.filter((entry) => {
        if (!filter) return true;
        if (String(entry.request?.url || '').includes(filter)) return true;
        return (entry._webSocketFrames || []).some((frame) =>
          String(frame.payloadData || '').includes(filter)
        );
      });
      const captures = matched.map((entry) => this._captureFromEntry(entry));
      this.lastCapture = captures;
      return { filter, captures };
    } finally {
      if (recorder.recording) {
        try { await recorder.stop(); } catch {}
      }
    }
  }

  async sequence(steps = []) {
    if (!Array.isArray(steps) || steps.length > 50) {
      throw new Error('sequence steps must be an array with at most 50 items');
    }
    const results = [];
    let screenshot = null;

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index] || {};
      const action = step.action;
      const args = step.args || {};
      let data;
      if (action === 'click') data = await this.click(args.x, args.y);
      else if (action === 'click_relative') data = await this.clickRelative(args.rx, args.ry);
      else if (action === 'wait') data = await this.wait(args.ms ?? 500);
      else if (action === 'open') data = await this.open(args.url);
      else if (action === 'trigger_and_capture') data = await this.triggerAndCapture(args);
      else if (action === 'status') data = await this.status();
      else if (action === 'screenshot') {
        const bytes = await this.screenshot(args.quality ?? 70);
        screenshot = { base64: bytes.toString('base64'), bytes: bytes.length, quality: args.quality ?? 70 };
        data = { bytes: bytes.length, quality: args.quality ?? 70 };
      } else {
        throw new Error(`unsupported sequence action: ${action}`);
      }
      results.push({ index, action, data });
    }

    return { steps: results, screenshot };
  }

  async execute(action, args = {}) {
    const aliases = {
      browser_status: 'status',
      browser_open: 'open',
      browser_screenshot: 'screenshot',
      browser_click: 'click',
      browser_click_relative: 'click_relative',
      browser_wait: 'wait'
    };
    const name = aliases[action] || action;
    if (name === 'status') return this.status();
    if (name === 'open') return this.open(args.url);
    if (name === 'wait') return this.wait(args.ms);
    if (name === 'click') return this.click(args.x, args.y);
    if (name === 'click_relative') return this.clickRelative(args.rx, args.ry);
    if (name === 'screenshot') {
      const bytes = await this.screenshot(args.quality);
      return { bytes, quality: Math.max(20, Math.min(Number(args.quality) || 65, 90)) };
    }
    if (name === 'network_clear') return this.networkClear();
    if (name === 'network_events') return this.networkEvents();
    if (name === 'trigger_and_capture') return this.triggerAndCapture(args);
    if (name === 'sequence') return this.sequence(args.steps || []);
    throw new Error(`unknown action: ${action}`);
  }
}

module.exports = { HardFireController };
