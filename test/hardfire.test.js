'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { HardFireController } = require('../src/hardfire-controller');
const { headersArrayToObject } = require('../src/redact');

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
