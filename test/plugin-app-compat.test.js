'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'plugin', 'HardFire');

test('HardFire plugin binds the existing callable Firetrace app for compatibility', () => {
  const app = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.app.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'));

  assert.equal(
    app.apps.firetrace.id,
    'asdk_app_6abaffe536c08191979691e13fcf10f8'
  );
  assert.equal(
    manifest.extensions['com.openai'].apps,
    './.app.json'
  );
});

test('HardFire uses the legacy firetrace agent id when only Firetrace control settings exist', () => {
  const keys = [
    'HARDFIRE_CONTROL_URL',
    'HARDFIRE_CONTROL_TOKEN',
    'HARDFIRE_AGENT_ID',
    'FIRETRACE_CONTROL_URL',
    'FIRETRACE_CONTROL_TOKEN',
    'FIRETRACE_AGENT_ID',
    'CF_CONTROL_URL',
    'CF_CONTROL_TOKEN'
  ];
  const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

  try {
    for (const key of keys) delete process.env[key];
    process.env.FIRETRACE_CONTROL_URL = 'https://control.example';
    process.env.FIRETRACE_CONTROL_TOKEN = 'secret';
    process.env.FIRETRACE_AGENT_ID = 'firetrace';

    delete require.cache[require.resolve('../src/remote-agent')];
    const { RemoteAgent } = require('../src/remote-agent');
    const agent = new RemoteAgent({});

    assert.equal(agent.baseUrl, 'https://control.example');
    assert.equal(agent.token, 'secret');
    assert.equal(agent.agentId, 'firetrace');
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
