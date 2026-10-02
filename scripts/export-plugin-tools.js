'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { startLocalMcp } = require('../src/local-mcp');

async function main() {
  const server = await startLocalMcp({}, { port: 0 });
  try {
    const response = await fetch(server.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' })
    });
    const body = await response.json();
    if (!response.ok || !Array.isArray(body.result?.tools)) throw new Error('Unable to export MCP tools');
    await fs.writeFile(path.join(__dirname, '../plugin/HardFire/mcp/tools.json'), JSON.stringify(body.result.tools, null, 2) + '\n');
    console.log(`Exported ${body.result.tools.length} HardFire tools`);
  } finally {
    await server.stop();
  }
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; });
