'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const net = require('node:net');
const http = require('node:http');
const { startLocalMcp } = require('../src/local-mcp');

async function client(t, endpoint, extraEnv = {}) {
  const [{ Client }, { StdioClientTransport }] = await Promise.all([
    import('@modelcontextprotocol/sdk/client/index.js'),
    import('@modelcontextprotocol/sdk/client/stdio.js')
  ]);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(__dirname, '../plugin/HardFire/mcp/bridge.cjs')],
    env: { ...process.env, HARDFIRE_MCP_URL: endpoint, ...extraEnv }, stderr: 'pipe'
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
    'hardfire_browser', 'hardfire_click', 'hardfire_click_ref', 'hardfire_click_relative', 'hardfire_fill_ref', 'hardfire_find', 'hardfire_inspect_ref', 'hardfire_launch', 'hardfire_network_clear',
    'hardfire_network_events', 'hardfire_open', 'hardfire_press', 'hardfire_record_save',
    'hardfire_record_start', 'hardfire_screenshot', 'hardfire_sequence', 'hardfire_snapshot',
    'hardfire_status', 'hardfire_tab_activate', 'hardfire_tab_close', 'hardfire_tab_new', 'hardfire_tabs', 'hardfire_trigger_and_capture', 'hardfire_wait', 'hardfire_wait_for'
  ]);
  const result = await connected.callTool({ name: 'hardfire_status', arguments: {} });
  assert.equal(result.isError, undefined);
  const status = JSON.parse(result.content[0].text);
  assert.equal(status.installed, true);
  assert.equal(status.connected, false);
});

test('plugin starts one hidden browser before concurrent calls and preserves visibility controls', async (t) => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hardfire-launch-'));
  const endpoint = await unavailableEndpoint();
  await fs.mkdir(path.join(root, 'node_modules/electron'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'hardfire', main: 'index.js' }));
  await fs.writeFile(path.join(root, 'node_modules/electron/path.txt'), process.execPath);
  await fs.writeFile(path.join(root, 'index.js'), `
    const { startLocalMcp } = require(${JSON.stringify(path.join(__dirname, '../src/local-mcp'))});
    let visible = !process.argv.includes('--hardfire-hidden');
    startLocalMcp({status: async () => ({connected:true, visible, pid:process.pid}),
      browser: async (mode) => { visible = mode === 'visible'; return {visible, pid:process.pid}; }
    }, {port: ${new URL(endpoint).port}});
  `);
  let pid;
  t.after(async () => { if (pid) { try { process.kill(pid); } catch {} } await fs.rm(root, { recursive:true, force:true, maxRetries:10, retryDelay:100 }); });
  const connected = await client(t, endpoint, { HARDFIRE_APP_PATH: root });
  const results = await Promise.all([1,2].map(() => connected.callTool({name:'hardfire_status', arguments:{}})));
  const states = results.map(r => JSON.parse(r.content[0].text));
  pid = states[0].pid;
  assert.equal(states[0].connected, true);
  assert.equal(states[0].visible, false);
  assert.equal(states[1].pid, pid);
  const shown = await connected.callTool({name:'hardfire_browser', arguments:{mode:'visible'}});
  assert.equal(JSON.parse(shown.content[0].text).visible, true);
  const hidden = await connected.callTool({name:'hardfire_browser', arguments:{mode:'hidden'}});
  assert.equal(JSON.parse(hidden.content[0].text).visible, false);
  const invalid = await connected.callTool({name:'hardfire_browser', arguments:{mode:'wrong'}});
  assert.equal(invalid.isError, true);
});

test('offline browser actions return a tool error rather than losing the installed plugin', async (t) => {
  const connected = await client(t, await unavailableEndpoint());
  const result = await connected.callTool({ name: 'hardfire_open', arguments: { url: 'https://example.test/' } });
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /HardFire/);
  assert.equal((await connected.listTools()).tools.length, 25);
});

for (const headless of [true, false]) {
  test(`explicit launch headless=${headless} overrides startup preference`, async (t) => {
    const fs = require('node:fs/promises');
    const os = require('node:os');
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hardfire-mode-'));
    const endpoint = await unavailableEndpoint();
    await fs.mkdir(path.join(root, 'node_modules/electron'), { recursive: true });
    await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'hardfire', main: 'index.js' }));
    await fs.writeFile(path.join(root, 'node_modules/electron/path.txt'), process.execPath);
    await fs.writeFile(path.join(root, 'index.js'), `
      const { startLocalMcp } = require(${JSON.stringify(path.join(__dirname, '../src/local-mcp'))});
      let visible = !process.argv.includes('--hardfire-hidden');
      const initialVisible = visible;
      startLocalMcp({ status: async () => ({connected:true, visible, initialVisible, pid:process.pid}),
        launch: async (headless) => { visible = !headless; return {visible, headless, initialVisible, pid:process.pid}; }
      }, {port:${new URL(endpoint).port}});
    `);
    let pid;
    t.after(async () => { if (pid) { try { process.kill(pid); } catch {} } await fs.rm(root, {recursive:true,force:true,maxRetries:10,retryDelay:100}); });
    const connected = await client(t, endpoint, {HARDFIRE_APP_PATH:root, HARDFIRE_HEADLESS:headless ? '0':'1'});
    const invalid = await connected.callTool({name:'hardfire_launch',arguments:{headless:'false'}});
    assert.equal(invalid.isError, true);
    await assert.rejects(fetch(new URL('/health', endpoint)));
    const result = await connected.callTool({name:'hardfire_launch',arguments:{headless}});
    const state = JSON.parse(result.content[0].text);
    pid = state.pid;
    assert.equal(state.initialVisible, !headless);
    assert.equal(state.visible, !headless);
    assert.equal(state.headless, headless);
  });
}

test('normal secondary-instance exit waits for the primary browser to become ready', async (t) => {
  const fs = require('node:fs/promises');
  const os = require('node:os');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'hardfire-secondary-'));
  await fs.mkdir(path.join(root, 'node_modules/electron'), { recursive:true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({name:'hardfire',main:'index.js'}));
  await fs.writeFile(path.join(root, 'node_modules/electron/path.txt'), process.execPath);
  await fs.writeFile(path.join(root, 'index.js'), 'process.exit(0);');
  const endpoint = await unavailableEndpoint();
  const connected = await client(t, endpoint, {HARDFIRE_APP_PATH:root});
  let server;
  const pendingServer = new Promise(resolve => setTimeout(resolve, 700)).then(async () => {
    server = await startLocalMcp({status:async () => ({connected:true})}, {port:Number(new URL(endpoint).port)});
  });
  t.after(async () => { await pendingServer; await server?.stop(); await fs.rm(root, {recursive:true,force:true,maxRetries:10,retryDelay:100}); });
  const result = await connected.callTool({name:'hardfire_status',arguments:{}});
  assert.equal(JSON.parse(result.content[0].text).connected, true);
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
  assert.equal((await connected.listTools()).tools.length, 25);
});




