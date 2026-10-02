'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('local MCP tab HTML contains all renderer targets', () => {
  const html = fs.readFileSync(
    path.join(__dirname, '..', 'src', 'mcp', 'index.html'),
    'utf8'
  );

  for (const id of [
    'localStatus',
    'endpoint',
    'config',
    'copyUrl',
    'copyConfig'
  ]) {
    assert.match(
      html,
      new RegExp(`id=["']${id}["']`),
      `missing MCP UI element #${id}`
    );
  }

  assert.match(html, /HardFire MCP/);
  assert.match(html, /hardfire_record_start/);
  assert.match(html, /hardfire_record_save/);
  assert.doesNotMatch(html, /Cloudflare WSS/i);
});
