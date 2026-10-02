'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HardFireController } = require('../src/hardfire-controller');
const { headersArrayToObject } = require('../src/redact');
const { EventEmitter } = require('node:events');

function controllerFixture() {
  const effects = [];
  const tab = {
    id: 1, kind: 'game',
    view: {
      getBounds: () => ({ width: 100, height: 80 }),
      webContents: {
        isDestroyed: () => false,
        getURL: () => 'https://game.test/',
        getTitle: () => 'Game',
        loadURL: async (url) => effects.push(['open', url]),
        debugger: Object.assign(new EventEmitter(), {
          isAttached: () => true,
          sendCommand: async (method, args) => effects.push([method, args])
        }),
        capturePage: async () => ({ toJPEG: (quality) => Buffer.from(`JPEG:${quality}`) })
      }
    }
  };
  const controller = new HardFireController({
    getActiveTab: () => tab,
    createTab: () => { effects.push(['create']); return tab; },
    networkTap: () => { effects.push(['record']); return null; }
  });
  return { controller, tab, effects };
}

test('controller refuses invalid navigation before changing the browser', async () => {
  const { controller, effects } = controllerFixture();
  for (const url of [undefined, '', 'not a url', 'file:///C:/secret', 'javascript:alert(1)', 'ftp://example.test']) {
    await assert.rejects(controller.open(url), /HTTP|HTTPS/);
  }
  assert.deepEqual(effects, []);
  assert.equal((await controller.open('https://game.test/')).url, 'https://game.test/');
});

test('controller rejects invalid absolute and relative clicks without dispatching input', async () => {
  const { controller, effects } = controllerFixture();
  for (const [x, y] of [[-1, 1], [null, 1], ['', 1], ['1', 2], [Infinity, 2], [1, undefined]]) {
    await assert.rejects(controller.click(x, y));
  }
  for (const [rx, ry] of [[null, 0.5], ['', 0.5], [-1, 0.5], [0.5, 2]]) {
    await assert.rejects(controller.clickRelative(rx, ry));
  }
  assert.deepEqual(effects, []);
  assert.deepEqual(await controller.clickRelative(1, 1), { x: 99, y: 79, width: 100, height: 80 });
});

test('controller validates waits and screenshot quality for sequence and direct callers', async () => {
  const { controller } = controllerFixture();
  for (const ms of [-1, null, '0', Infinity, 60001, 0.5]) await assert.rejects(controller.wait(ms));
  for (const quality of [0, 100, null, '65', Infinity, 65.5]) await assert.rejects(controller.screenshot(quality));
  assert.deepEqual(await controller.wait(0), { waited_ms: 0 });
  assert.equal((await controller.screenshot(65)).toString(), 'JPEG:65');
});

test('invalid capture arguments are rejected before starting HAR recording', async () => {
  const { controller, effects } = controllerFixture();
  for (const args of [{}, { x: 1 }, { x: -1, y: 2 }, { rx: null, ry: 0.5 }, { x: 1, y: 2, wait_ms: -1 }]) {
    await assert.rejects(controller.triggerAndCapture(args));
  }
  assert.deepEqual(effects, []);
});

test('sequence validates all steps before executing the first browser action', async () => {
  const { controller, effects } = controllerFixture();
  for (const step of [
    { action: 'unknown' }, { action: 'click', args: { x: -1, y: 1 } },
    { action: 'open', args: { url: 'file:///C:/secret' } },
    { action: 'wait', args: [] }, null
  ]) {
    await assert.rejects(controller.sequence([{ action: 'open', args: { url: 'https://game.test/' } }, step]));
  }
  assert.deepEqual(effects, []);
});

test('read-only status and screenshot do not create browser tabs', async () => {
  let created = 0;
  const controller = new HardFireController({
    getActiveTab: () => ({ kind: 'mcp' }),
    createTab: () => { created += 1; throw new Error('unexpected tab creation'); }
  });
  assert.equal((await controller.status()).connected, false);
  await assert.rejects(controller.screenshot(), /tab/);
  assert.equal(created, 0);
});

test('sensitive HAR headers are redacted', () => {
  const headers = headersArrayToObject([
    { name: 'Authorization', value: 'Bearer secret' },
    { name: 'Content-Type', value: 'application/json' }
  ]);
  assert.equal(headers.Authorization, '[REDACTED]');
  assert.equal(headers['Content-Type'], 'application/json');
});

test('controller delegates full HAR recording start and save', async () => {
  const tab = {
    id: 7,
    kind: 'game',
    url: 'https://game.test',
    view: {
      webContents: {
        isDestroyed: () => false,
        getURL: () => 'https://game.test'
      }
    }
  };

  const calls = [];

  const controller = new HardFireController({
    getActiveTab: () => tab,
    createTab: () => tab,
    activateTab: () => true,
    networkTap: () => null,
    startRecording: async (target) => {
      calls.push(['start', target.id]);
      return { ok: true };
    },
    saveRecording: async (target) => {
      calls.push(['save', target.id]);
      return {
        ok: true,
        path: 'C:/Users/test/Downloads/HardFire-HARs/test.har',
        entries: 4,
        bytes: 1200
      };
    }
  });

  const started = await controller.recordStart();
  const saved = await controller.recordSave();

  assert.equal(started.ok, true);
  assert.equal(started.tab_id, 7);
  assert.equal(saved.ok, true);
  assert.equal(saved.entries, 4);
  assert.deepEqual(calls, [
    ['start', 7],
    ['save', 7]
  ]);
});
