'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const pluginRoot = path.join(root, 'plugin', 'HardFire');

test('ChatGPT plugin uses the callable HTTPS MCP while localhost MCP remains in the app', () => {
  const portable = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'));
  const compat = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  const expected = {
    type: 'streamable-http',
    url: 'https://hardfire-mcp.braian-n-l.workers.dev/mcp'
  };

  assert.deepEqual(portable.mcpServers.hardfire, expected);
  assert.deepEqual(compat.mcpServers.hardfire, expected);

  const localSource = fs.readFileSync(path.join(root, 'src', 'local-mcp.js'), 'utf8');
  assert.match(localSource, /127\.0\.0\.1/);
  assert.match(localSource, /8765/);
});
