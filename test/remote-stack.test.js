'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const pluginRoot = path.join(root, 'plugin', 'HardFire');

test('HardFire exposes the remote callable MCP endpoint while keeping localhost for Worker use', () => {
  const pluginMcp = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'));
  assert.equal(
    pluginMcp.mcpServers.hardfire.url,
    'https://hardfire-mcp.braian-n-l.workers.dev/mcp'
  );

  const localMcp = fs.readFileSync(path.join(root, 'src', 'local-mcp.js'), 'utf8');
  assert.match(localMcp, /127\.0\.0\.1/);
  assert.match(localMcp, /8765/);
});

test('remote agent builds the HardFire WSS endpoint with its own agent id', () => {
  const { wsUrl } = require('../src/remote-agent');
  assert.equal(
    wsUrl('https://control.example', 'hardfire'),
    'wss://control.example/ws?agent_id=hardfire'
  );
});
