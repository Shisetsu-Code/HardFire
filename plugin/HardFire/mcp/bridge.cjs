'use strict';

const readline = require('node:readline');
const { version } = require('../plugin.json');
const tools = require('./tools.json');

const endpoint = process.env.HARDFIRE_MCP_URL || 'http://127.0.0.1:8765/mcp';
const ensureBrowser = require('./launch.cjs').createLauncher(endpoint);
const protocols = ['2025-03-26', '2025-06-18', '2025-11-25'];
let protocolVersion = protocols.at(-1);
const pending = new Set();
const requests = new Map();

function reply(id, result, error) {
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, ...(error ? { error } : { result }) }) + '\n');
}

function toolError(message) {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

function parseResponse(body, contentType, id) {
  if (!contentType.includes('text/event-stream')) return JSON.parse(body);
  for (const event of body.split(/\r?\n\r?\n/)) {
    const data = event.split(/\r?\n/).filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') continue;
    const message = JSON.parse(data);
    if (message.id === id) return message;
  }
  throw new Error('MCP response did not contain the requested result');
}

async function callTool(message) {
  const name = message.params?.name;
  if (!tools.some((tool) => tool.name === name)) return toolError('Unknown HardFire tool: ' + name);
  if (name === 'hardfire_launch' && typeof message.params?.arguments?.headless !== 'boolean') return toolError('headless must be boolean');
  const abort = new AbortController();
  requests.set(message.id, abort);
  let responded = false;
  try {
    await ensureBrowser(name === 'hardfire_launch' ? {headless:message.params.arguments.headless} : {});
    abort.signal.throwIfAborted();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': protocolVersion
      },
      body: JSON.stringify(message),
      signal: AbortSignal.any([abort.signal, AbortSignal.timeout(300000)])
    });
    responded = true;
    const body = parseResponse(await response.text(), response.headers.get('content-type') || '', message.id);
    if (body.error && typeof body.error.code === 'number') {
      const error = new Error(body.error.message);
      error.rpcError = body.error;
      throw error;
    }
    if (!response.ok) throw new Error('HTTP ' + response.status);
    if (!Array.isArray(body.result?.content)) throw new Error('Invalid MCP tool response');
    return body.result;
  } catch (error) {
    if (error.rpcError) throw error;
    const reason = error?.message || String(error);
    if (responded) return toolError('HardFire MCP request failed: ' + reason);
    // Discovery belongs to this installed plugin. Browser availability is separate.
    if (name === 'hardfire_status') {
      return { content: [{ type: 'text', text: JSON.stringify({
        installed: true, connected: false, endpoint,plugin_version:version,tools_available:tools.length,
        error: 'HardFire browser unavailable: ' + reason,
        next_action: 'Check HARDFIRE_APP_PATH or start HardFire manually, then retry.'
      }) }] };
    }
    return toolError('HardFire is installed, but its browser MCP is unavailable (' + reason + '). Start HardFire on this PC and retry.');
  } finally {
    requests.delete(message.id);
  }
}

async function handle(message) {
  if (!message || Array.isArray(message) || message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    reply(null, null, { code: -32600, message: 'Invalid Request' });
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(message, 'id')) {
    if (message.method === 'notifications/cancelled') requests.get(message.params?.requestId)?.abort();
    return;
  }
  if (message.method === 'initialize') {
    if (protocols.includes(message.params?.protocolVersion)) protocolVersion = message.params.protocolVersion;
    reply(message.id, { protocolVersion, capabilities: { tools: {} }, serverInfo: { name: 'HardFire', version },instructions:'Local HardFire browser. Call hardfire_launch with headless=true or false to choose visibility. Tools run on this PC; loading the skill in another host does not expose this MCP.' });
  } else if (message.method === 'ping') {
    reply(message.id, {});
  } else if (message.method === 'tools/list') {
    reply(message.id, { tools });
  } else if (message.method === 'tools/call') {
    reply(message.id, await callTool(message));
  } else {
    reply(message.id, null, { code: -32601, message: 'Method not found: ' + message.method });
  }
}

const input = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
input.on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try { message = JSON.parse(line); } catch {
    reply(null, null, { code: -32700, message: 'Parse error' });
    return;
  }
  const task = handle(message).catch((error) => {
    reply(message.id ?? null, null, error.rpcError || { code: -32603, message: error.message });
  }).finally(() => pending.delete(task));
  pending.add(task);
});
input.on('close', () => {
  for (const abort of requests.values()) abort.abort();
  void Promise.allSettled([...pending]).then(() => process.exit(0));
});
