'use strict';

const { HarRecorder } = require('./har-recorder');
const { headersArrayToObject } = require('./redact');
const { isBrowserVisible, setBrowserMode } = require('./browser-window-mode');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function validateNumber(value, name, min, max = Infinity, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? 'an integer' : 'a finite number'} between ${min} and ${max}`);
  }
}

function validateArgs(action, args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('action args must be an object');
  }
  if (action === 'open') {
    let url;
    try { if (typeof args.url === 'string') url = new URL(args.url); } catch {}
    if (!url || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('url must be an absolute HTTP or HTTPS URL');
    }
  } else if (action === 'click') {
    validateNumber(args.x, 'x', 0);
    validateNumber(args.y, 'y', 0);
  } else if (action === 'click_relative') {
    validateNumber(args.rx, 'rx', 0, 1);
    validateNumber(args.ry, 'ry', 0, 1);
  } else if (action === 'wait') {
    validateNumber(args.ms === undefined ? 1000 : args.ms, 'ms', 0, 60000, true);
  } else if (action === 'screenshot') {
    validateNumber(args.quality === undefined ? 65 : args.quality, 'quality', 20, 90, true);
  } else if (action === 'trigger_and_capture') {
    const absolute = args.x !== undefined || args.y !== undefined;
    const relative = args.rx !== undefined || args.ry !== undefined;
    if (!absolute && !relative) throw new Error('provide x/y or rx/ry');
    if (absolute) validateArgs('click', args);
    if (relative) validateArgs('click_relative', args);
    validateNumber(args.wait_ms === undefined ? 2500 : args.wait_ms, 'wait_ms', 0, 30000, true);
    if (args.url_contains !== undefined && (typeof args.url_contains !== 'string' || args.url_contains.length > 2000)) {
      throw new Error('url_contains must be a string with at most 2000 characters');
    }
  } else if (!['record_start', 'record_save', 'status', 'network_clear', 'network_events', 'sequence'].includes(action)) {
    throw new Error(`unsupported action: ${action}`);
  }
}

class HardFireController {
  constructor(options) {
    this.getActiveTab = options.getActiveTab;
    this.createTab = options.createTab;
    this.activateTab = options.activateTab;
    this.networkTap = options.networkTap;
    this.startRecordingCallback = options.startRecording;
    this.saveRecordingCallback = options.saveRecording;
    this.getBrowserWindow = options.getBrowserWindow;
    this.lastCapture = [];
  }

  _tab(create = true) {
    let tab = this.getActiveTab?.();
    if ((!tab || tab.kind !== 'game') && create) {
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
    const tab = this.getActiveTab?.();
    if (!tab || tab.kind !== 'game' || !tab.view?.webContents || tab.view.webContents.isDestroyed()) {
      return {
        backend: 'hard-browser-electron-cdp', connected: false, tab_id: null,
        url: '', title: '', viewport: { width: 0, height: 0 },
        recording: false, speed: 1, muted: false, ws: 0
      };
    }
    const wc = this._wc(tab);
    let bounds = { width: 0, height: 0 };
    try { bounds = tab.view.getBounds(); } catch {}
    return {
      backend: 'hard-browser-electron-cdp',
      visible: this.getBrowserWindow ? isBrowserVisible(this.getBrowserWindow()) : null,
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

  async browser(mode) {
    const state = setBrowserMode(this.getBrowserWindow?.(), mode);
    return { ...(await this.status()), ...state };
  }

  async open(url) {
    validateArgs('open', { url });
    const tab = this._tab();
    const wc = this._wc(tab);
    await wc.loadURL(String(url));
    return { url: wc.getURL() || String(url), tab_id: tab.id };
  }

  async wait(ms = 1000) {
    validateArgs('wait', { ms });
    await delay(ms);
    return { waited_ms: ms };
  }

  async click(x, y) {
    validateArgs('click', { x, y });
    const tab = this._tab();
    const px = x;
    const py = y;
    await this._send(tab, 'Input.dispatchMouseEvent', {
      type: 'mousePressed', x: px, y: py, button: 'left', clickCount: 1
    });
    await this._send(tab, 'Input.dispatchMouseEvent', {
      type: 'mouseReleased', x: px, y: py, button: 'left', clickCount: 1
    });
    return { x: px, y: py };
  }

  async clickRelative(rx, ry) {
    validateArgs('click_relative', { rx, ry });
    const tab = this._tab();
    const bounds = tab.view.getBounds();
    if (!(bounds.width > 0 && bounds.height > 0)) {
      throw new Error('Browser tab viewport is empty');
    }
    const x = Math.min(bounds.width - 1, bounds.width * rx);
    const y = Math.min(bounds.height - 1, bounds.height * ry);
    await this.click(x, y);
    return { x, y, width: bounds.width, height: bounds.height };
  }

  async screenshot(quality = 65) {
    validateArgs('screenshot', { quality });
    const wc = this._wc(this._tab(false));
    const image = await wc.capturePage();
    return image.toJPEG(quality);
  }

  networkClear() {
    this.lastCapture = [];
    return { cleared: true };
  }

  networkEvents() {
    return { events: this.lastCapture };
  }

  async recordStart() {
    const tab = this._tab();

    if (typeof this.startRecordingCallback !== 'function') {
      throw new Error('HAR recording control is unavailable');
    }

    const result =
      await this.startRecordingCallback(tab);

    if (!result?.ok) {
      throw new Error(
        result?.error ||
        'Unable to start HAR recording'
      );
    }

    return {
      ...result,
      tab_id: tab.id,
      url:
        this._wc(tab).getURL() ||
        tab.url ||
        'about:blank'
    };
  }

  async recordSave() {
    const tab = this._tab();

    if (typeof this.saveRecordingCallback !== 'function') {
      throw new Error('HAR save control is unavailable');
    }

    const result =
      await this.saveRecordingCallback(tab);

    if (!result?.ok) {
      throw new Error(
        result?.error ||
        'Unable to save HAR recording'
      );
    }

    return {
      ...result,
      tab_id: tab.id
    };
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

  async triggerAndCapture(args = {}) {
    validateArgs('trigger_and_capture', args);
    const {
      url_contains = 'fn=play',
      x = null,
      y = null,
      rx = null,
      ry = null,
      wait_ms = 2500
    } = args;
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
        await this.click(x, y);
      } else if (rx !== null && ry !== null) {
        await this.clickRelative(rx, ry);
      } else {
        throw new Error('provide x/y or rx/ry');
      }

      await delay(wait_ms);
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
    for (const step of steps) {
      if (!step || typeof step !== 'object' || Array.isArray(step) || typeof step.action !== 'string' || step.action === 'sequence') {
        throw new Error('each sequence step must have a supported action');
      }
      validateArgs(step.action, step.args === undefined ? {} : step.args);
      if (['network_clear', 'network_events'].includes(step.action)) {
        throw new Error(`unsupported sequence action: ${step.action}`);
      }
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
      else if (action === 'wait') data = await this.wait(args.ms === undefined ? 500 : args.ms);
      else if (action === 'open') data = await this.open(args.url);
      else if (action === 'trigger_and_capture') data = await this.triggerAndCapture(args);
      else if (action === 'record_start') data = await this.recordStart();
      else if (action === 'record_save') data = await this.recordSave();
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
    if (typeof action !== 'string') throw new Error('action must be a string');
    const aliases = {
      browser_status: 'status',
      browser_open: 'open',
      browser_screenshot: 'screenshot',
      browser_click: 'click',
      browser_click_relative: 'click_relative',
      browser_wait: 'wait'
    };
    const aliased = aliases[action] || action;
    const name = aliased.startsWith('hardfire_')
      ? aliased.slice('hardfire_'.length)
      : aliased;
    validateArgs(name, args);
    if (name === 'status') return this.status();
    if (name === 'open') return this.open(args.url);
    if (name === 'wait') return this.wait(args.ms);
    if (name === 'click') return this.click(args.x, args.y);
    if (name === 'click_relative') return this.clickRelative(args.rx, args.ry);
    if (name === 'screenshot') {
      const bytes = await this.screenshot(args.quality);
      return { bytes, quality: args.quality === undefined ? 65 : args.quality };
    }
    if (name === 'network_clear') return this.networkClear();
    if (name === 'network_events') return this.networkEvents();
    if (name === 'record_start' || name === 'hardfire_record_start') return this.recordStart();
    if (name === 'record_save' || name === 'hardfire_record_save') return this.recordSave();
    if (name === 'trigger_and_capture') return this.triggerAndCapture(args);
    if (name === 'sequence') return this.sequence(args.steps === undefined ? [] : args.steps);
    throw new Error(`unknown action: ${action}`);
  }
}

module.exports = { HardFireController };
