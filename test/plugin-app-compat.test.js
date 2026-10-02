'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'plugin', 'HardFire');

test('HardFire plugin is local-only and does not bind the Firetrace app', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'plugin.json'), 'utf8'));
  const compat = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.codex-plugin', 'plugin.json'), 'utf8'));

  assert.equal(manifest.extensions['com.openai'].apps, undefined);
  assert.equal(compat.apps, undefined);
  assert.equal(fs.existsSync(path.join(pluginRoot, '.app.json')), false);

  const serialized = JSON.stringify({ manifest, compat }).toLowerCase();
  assert.equal(serialized.includes('firetrace'), false);
});

test('HardFire plugin keeps the localhost MCP as its only declared MCP transport', () => {
  const portable = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'));
  const compat = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  const expected = {
    type: 'streamable-http',
    url: 'http://127.0.0.1:8765/mcp'
  };

  assert.deepEqual(portable.mcpServers, { hardfire: expected });
  assert.deepEqual(compat.mcpServers, { hardfire: expected });
});
