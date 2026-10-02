'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { wsUrl } = require('../src/remote-agent');
const { headersArrayToObject } = require('../src/redact');

test('remote Firetrace URL is converted to WSS', () => {
  assert.equal(
    wsUrl('https://control.example', 'firetrace'),
    'wss://control.example/ws?agent_id=firetrace'
  );
});

test('sensitive HAR headers are redacted', () => {
  const headers = headersArrayToObject([
    { name: 'Authorization', value: 'Bearer secret' },
    { name: 'Content-Type', value: 'application/json' }
  ]);
  assert.equal(headers.Authorization, '[REDACTED]');
  assert.equal(headers['Content-Type'], 'application/json');
});
