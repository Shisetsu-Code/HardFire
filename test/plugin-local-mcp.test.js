'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const pluginRoot = path.join(__dirname, '..', 'plugin', 'HardFire');

test('desktop plugin connects directly to the local HardFire HTTP MCP', () => {
  const portable = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'));
  const compat = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  assert.deepEqual(portable.mcpServers.hardfire, {
    type: 'streamable-http',
    url: 'http://127.0.0.1:8765/mcp'
  });

  assert.deepEqual(compat.mcpServers.hardfire, {
    type: 'streamable-http',
    url: 'http://127.0.0.1:8765/mcp'
  });
});
