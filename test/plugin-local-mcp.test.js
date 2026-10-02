'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const pluginRoot = path.join(repoRoot, 'plugin', 'HardFire');
const bridgePath = path.join(pluginRoot, 'mcp', 'bridge.cjs');

test('desktop plugin declares a local stdio MCP bridge', () => {
  const portable = JSON.parse(fs.readFileSync(path.join(pluginRoot, 'mcp.json'), 'utf8'));
  const compat = JSON.parse(fs.readFileSync(path.join(pluginRoot, '.mcp.json'), 'utf8'));

  assert.equal(portable.mcpServers.hardfire.type, 'stdio');
  assert.equal(portable.mcpServers.hardfire.command, 'node');
  assert.deepEqual(portable.mcpServers.hardfire.args, ['./mcp/bridge.cjs']);

  assert.equal(compat.mcpServers.hardfire.command, 'node');
  assert.deepEqual(compat.mcpServers.hardfire.args, ['./mcp/bridge.cjs']);
});

test('stdio bridge relays initialize to the local HardFire HTTP MCP', async (t) => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const message = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requests.push({
      method: req.method,
      url: req.url,
      accept: req.headers.accept,
      message
    });

    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2026-07-28',
        capabilities: {},
        serverInfo: { name: 'HardFire', version: '1.3.0' }
      }
    }));
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  const address = server.address();
  const child = spawn(process.execPath, [bridgePath], {
    env: {
      ...process.env,
      HARDFIRE_MCP_URL: `http://127.0.0.1:${address.port}/mcp`
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });
  t.after(() => child.kill());

  const output = new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');

    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      const newline = stdout.indexOf('\n');
      if (newline !== -1) {
        try {
          resolve(JSON.parse(stdout.slice(0, newline)));
        } catch (error) {
          reject(error);
        }
      }
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.once('exit', (code) => {
      reject(new Error(`bridge exited before replying (code ${code}): ${stderr}`));
    });
  });

  const initialize = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2026-07-28',
      capabilities: {},
      clientInfo: { name: 'test-client', version: '1.0.0' }
    }
  };

  child.stdin.write(JSON.stringify(initialize) + '\n');

  const response = await Promise.race([
    output,
    new Promise((_, reject) => setTimeout(() => reject(new Error('bridge response timeout')), 3000))
  ]);

  assert.equal(response.id, 1);
  assert.equal(response.result.serverInfo.name, 'HardFire');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, 'POST');
  assert.equal(requests[0].url, '/mcp');
  assert.match(requests[0].accept, /application\/json/);
  assert.equal(requests[0].message.method, 'initialize');
});
