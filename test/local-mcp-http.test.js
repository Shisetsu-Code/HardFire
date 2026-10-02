'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { startLocalMcp } = require('../src/local-mcp');

const headers = {
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream'
};

async function start(t, controller = {}) {
  const server = await startLocalMcp(controller, { port: 0 });
  t.after(() => server.stop());
  return server;
}

async function post(server, body, extraHeaders = {}) {
  return fetch(server.endpoint, {
    method: 'POST', headers: { ...headers, ...extraHeaders }, body,
    signal: AbortSignal.timeout(5000)
  });
}

test('MCP malformed JSON returns a JSON-RPC parse error and remains available', async (t) => {
  const server = await start(t);
  const response = await post(server, '{bad');
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.equal(body.jsonrpc, '2.0');
  assert.equal(body.error.code, -32700);
  assert.equal(body.id, null);
  assert.equal((await fetch(server.health)).status, 200);
});
test('disconnecting a client cancels its browser wait',async(t)=>{
  let entered;let cancelled;
  const started=new Promise(resolve=>{entered=resolve;});
  const stopped=new Promise(resolve=>{cancelled=resolve;});
  const server=await start(t,{waitFor:async({signal})=>{entered();await new Promise(resolve=>signal.addEventListener('abort',resolve,{once:true}));cancelled();throw new Error('cancelled');}});
  const abort=new AbortController();
  const pending=fetch(server.endpoint,{method:'POST',headers,signal:abort.signal,body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'hardfire_wait_for',arguments:{condition:{type:'text',value:'never'}}}})}).catch(()=>{});
  await started;abort.abort();await pending;
  await Promise.race([stopped,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('wait was not cancelled')),1000);timer.unref();})]);
  assert.equal((await fetch(server.health)).status,200);
});

test('MCP shutdown closes in-flight connections without waiting for the browser action', async (t) => {
  let release;
  let entered;
  const pending = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { entered = resolve; });
  const server = await start(t, { status: async () => { entered(); await pending; return { connected: true }; } });
  const request = post(server, JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'hardfire_status', arguments: {} }
  })).catch((error) => error);
  let timer;
  try {
    await Promise.race([started, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('status handler was not reached')), 5000);
    })]);
    clearTimeout(timer);
    const stopping = server.stop();
    const stoppedPromptly = await Promise.race([
      stopping.then(() => true),
      new Promise((resolve) => { timer = setTimeout(() => resolve(false), 500); })
    ]);
    assert.equal(stoppedPromptly, true);
    assert.equal(server.state().listening, false);
    await server.stop();
  } finally {
    clearTimeout(timer);
    release();
    await request;
  }
});

test('MCP reports tool failures as tool errors and remains usable', async (t) => {
  const server = await start(t, { status: async () => { throw new Error('Browser tab is closed'); } });
  const response = await post(server, JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'hardfire_status', arguments: {} }
  }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.result.isError, true);
  assert.deepEqual(JSON.parse(body.result.content[0].text), { error: 'Browser tab is closed' });
  assert.equal((await fetch(server.health)).status, 200);
});

test('MCP rejects oversized bodies rather than buffering them without a limit', async (t) => {
  const server = await start(t);
  const response = await post(server, JSON.stringify({ payload: 'x'.repeat(5 * 1024 * 1024) }));
  assert.equal(response.status, 413);
});

test('MCP validates Content-Type before parsing the body', async (t) => {
  const server = await start(t);
  const response = await post(server, '{bad', { 'content-type': 'text/plain' });
  assert.equal(response.status, 415);
});

test('MCP initializes with the application version and serves tools on subsequent requests', async (t) => {
  const server = await start(t, { status: async () => ({ connected: true, tab_id: 7 }) });
  const init = await post(server, JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '1' } }
  }));
  assert.equal(init.status, 200);
  const initialized = await init.json();
  assert.equal(initialized.result.serverInfo.version, require('../package.json').version);
  const tools = await post(server, JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }));
  const listed = await tools.json();
  assert.equal(listed.result.tools.length, 25);
  const call = await post(server, JSON.stringify({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'hardfire_status', arguments: {} }
  }));
  const called = await call.json();
  assert.deepEqual(JSON.parse(called.result.content[0].text), { connected: true, tab_id: 7 });
});

test('MCP port zero reports the actual listening endpoint', async (t) => {
  const server = await startLocalMcp({}, { port: 0 });
  t.after(() => server.stop());
  const second = await startLocalMcp({}, { port: 0 });
  t.after(() => second.stop());
  assert.ok(server.state().port > 0);
  assert.notEqual(server.state().port, second.state().port);
  const response = await fetch(server.health);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).endpoint, server.endpoint);
});

test('MCP closes per-request resources when connection setup fails', async (t) => {
  const { McpServer } = await import('@modelcontextprotocol/sdk/server/mcp.js');
  const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
  const originalConnect = McpServer.prototype.connect;
  const originalServerClose = McpServer.prototype.close;
  const originalTransportClose = StreamableHTTPServerTransport.prototype.close;
  let serverClosed = 0;
  let transportClosed = 0;
  // Inject the otherwise external SDK setup failure, preserving real cleanup.
  McpServer.prototype.connect = async () => { throw new Error('test connection failure'); };
  McpServer.prototype.close = async function () { serverClosed += 1; return originalServerClose.call(this); };
  StreamableHTTPServerTransport.prototype.close = async function () { transportClosed += 1; return originalTransportClose.call(this); };
  try {
    const server = await start(t);
    const response = await post(server, JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }));
    assert.equal(response.status, 500);
    await response.json();
    // The response may arrive before its async cleanup finishes.
    for (let i = 0; i < 20 && (!serverClosed || !transportClosed); i += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(serverClosed, 1);
    assert.equal(transportClosed, 1);
  } finally {
    McpServer.prototype.connect = originalConnect;
    McpServer.prototype.close = originalServerClose;
    StreamableHTTPServerTransport.prototype.close = originalTransportClose;
  }
});



