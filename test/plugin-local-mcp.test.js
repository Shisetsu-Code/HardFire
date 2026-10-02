'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'plugin', 'HardFire');

test('HardFire launches its bundled MCP bridge independently of browser availability', () => {
  const portable = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'));
  const compat = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  const expected = {
    type: 'stdio',
    command: 'node',
    args: ['${PLUGIN_ROOT}/mcp/bridge.cjs'],
    cwd: '${PLUGIN_ROOT}'
  };

  assert.deepEqual(portable.mcpServers.hardfire, expected);
  assert.deepEqual(compat.mcpServers.hardfire, expected);

  assert.equal(fs.existsSync(path.join(pluginRoot, 'mcp/bridge.cjs')), true);
  assert.equal(fs.existsSync(path.join(pluginRoot, 'mcp/tools.json')), true);
});
