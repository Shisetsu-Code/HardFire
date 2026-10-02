'use strict';

const readline = require('node:readline');

const endpoint = process.env.HARDFIRE_MCP_URL || 'http://127.0.0.1:8765/mcp';
let protocolVersion = '';

function writeMessage(message) {
  process.stdout.write(JSON.stringify(message) + '\n');
}

function writeError(message, error) {
  const text = error?.message || String(error);
  if (message && Object.prototype.hasOwnProperty.call(message, 'id')) {
    writeMessage({
      jsonrpc: '2.0',
      id: message.id,
      error: {
        code: -32000,
        message: `HardFire local MCP unavailable: ${text}`
      }
    });
    return;
  }
  process.stderr.write(`HardFire MCP bridge: ${text}\n`);
}

function parseSse(body) {
  const messages = [];
  const events = body.split(/\r?\n\r?\n/);

  for (const event of events) {
    const data = event
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');

    if (!data || data === '[DONE]') continue;
    messages.push(JSON.parse(data));
  }

  return messages;
}

async function relay(message) {
  const headers = {
    accept: 'application/json, text/event-stream',
    'content-type': 'application/json'
  };

  if (protocolVersion && message.method !== 'initialize') {
    headers['mcp-protocol-version'] = protocolVersion;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(message)
  });

  if (response.status === 202 || response.status === 204) return;

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}${body ? `: ${body.slice(0, 500)}` : ''}`);
  }
  if (!body.trim()) return;

  const contentType = response.headers.get('content-type') || '';
  const replies = contentType.includes('text/event-stream')
    ? parseSse(body)
    : [JSON.parse(body)];

  for (const reply of replies) {
    if (
      message.method === 'initialize' &&
      reply &&
      reply.result &&
      typeof reply.result.protocolVersion === 'string'
    ) {
      protocolVersion = reply.result.protocolVersion;
    }
    writeMessage(reply);
  }
}

const input = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

let queue = Promise.resolve();

input.on('line', (line) => {
  if (!line.trim()) return;

  queue = queue.then(async () => {
    let message;
    try {
      message = JSON.parse(line);
    } catch (error) {
      process.stderr.write(`HardFire MCP bridge: invalid JSON from client: ${error.message}\n`);
      return;
    }

    try {
      await relay(message);
    } catch (error) {
      writeError(message, error);
    }
  });
});

input.on('close', () => {
  queue.finally(() => process.exit(0));
});
