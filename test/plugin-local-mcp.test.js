'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'plugin', 'HardFire');

test('HardFire declares its direct localhost MCP for Desktop and Worker clients', () => {
  const portable = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'));
  const compat = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  const expected = {
    type: 'streamable-http',
    url: 'http://127.0.0.1:8765/mcp'
  };

  assert.deepEqual(portable.mcpServers.hardfire, expected);
  assert.deepEqual(compat.mcpServers.hardfire, expected);

  const localSource = fs.readFileSync(path.join(root, 'src', 'local-mcp.js'), 'utf8');
  assert.match(localSource, /127\.0\.0\.1/);
  assert.match(localSource, /8765/);
});
