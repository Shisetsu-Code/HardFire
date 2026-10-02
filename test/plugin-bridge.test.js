'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { startLocalMcp } = require('../src/local-mcp');

async function client(t, endpoint) {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js')
  ]);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '../plugin/HardFire/mcp/bridge.cjs')],
    env: { ...process.env, HARDFIRE_MCP_URL: endpoint }, stderr: 'pipe'
  });
  const connected = new Client({ name: 'plugin-test', version: '1' });
  t.after(() => connected.close());
  await connected.connect(transport, { timeout: 3000 });
  return connected;
}

async function unavailableEndpoint() {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return `http://127.0.0.1:${port}/mcp`;
}

test('installed plugin advertises all tools even when the browser is closed', async (t) => {
  const connected = await client(t, await unavailableEndpoint());
  const listed = await connected.listTools();
  assert.deepEqual(listed.tools.map((tool) => tool.name).sort(), [
    'hardfire_click', 'hardfire_click_relative', 'hardfire_network_clear',
    'hardfire_network_events', 'hardfire_open', 'hardfire_record_save',
    'hardfire_record_start', 'hardfire_screenshot', 'hardfire_sequence',
    'hardfire_status', 'hardfire_trigger_and_capture', 'hardfire_wait'
  ]);
  const result = await connected.callTool({ name: 'hardfire_status', arguments: {} });
  assert.equal(result.isError, undefined);
  const status = JSON.parse(result.content[0].text);
  assert.equal(status.installed, true);
  assert.equal(status.connected, false);
});

test('offline browser actions return a tool error rather than losing the installed plugin', async (t) => {
  const connected = await client(t, await unavailableEndpoint());
  const result = await connected.callTool({ name: 'hardfire_open', arguments: { url: 'https://example.test/' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /HardFire/);
  assert.equal((await connected.listTools()).tools.length, 12);
});

test('plugin preserves backend JSON-RPC errors instead of reporting a closed browser', async (t) => {
  const backend = http.createServer((_req, res) => {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: 2, error: {
      code: -32602, message: 'Invalid tool arguments', data: { field: 'quality' }
    } }));
  });
  await new Promise((resolve) => backend.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { backend.close(resolve); backend.closeAllConnections(); }));
  const connected = await client(t, `http://127.0.0.1:${backend.address().port}/mcp`);
  await assert.rejects(connected.callTool({ name: 'hardfire_status', arguments: {} }), (error) => {
    assert.equal(error.code, -32602);
    assert.deepEqual(error.data, { field: 'quality' });
    assert.match(error.message, /Invalid tool arguments/);
    return true;
  });
});

test('plugin relays live calls and its bundled tool schemas match the HTTP server', async (t) => {
  const server = await startLocalMcp({ status: async () => ({ connected: true, tab_id: 7 }) }, { port: 0 });
  t.after(() => server.stop());
  const connected = await client(t, server.endpoint);
  const response = await fetch(server.endpoint, {
    method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
  });
  const liveTools = (await response.json()).result.tools;
  assert.deepEqual((await connected.listTools()).tools, liveTools);
  const result = await connected.callTool({ name: 'hardfire_status', arguments: {} });
  assert.deepEqual(JSON.parse(result.content[0].text), { connected: true, tab_id: 7 });
  await server.stop();
  const offline = await connected.callTool({ name: 'hardfire_status', arguments: {} });
  assert.equal(JSON.parse(offline.content[0].text).connected, false);
  assert.equal((await connected.listTools()).tools.length, 12);
});
