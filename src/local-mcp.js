'use strict';

const http = require('node:http');
const { version } = require('../package.json');

function json(res, status, body) {
  const payload = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': payload.length,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, GET, OPTIONS',
    'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version'
  });
  res.end(payload);
}

async function createProtocolServer(controller) {
  const [{ McpServer }, { z }] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('zod')
  ]);

  const server = new McpServer({ name: 'HardFire', version });
  const text = (value) => ({
    content: [{ type: 'text', text: JSON.stringify(value) }]
  });
  const annotations = (readOnly) => ({
    readOnlyHint: readOnly,
    destructiveHint: !readOnly,
    idempotentHint: readOnly,
    openWorldHint: true
  });
  const register = (name, description, inputSchema, readOnly, handler) =>
    server.registerTool(name, {
      description,
      inputSchema,
      annotations: annotations(readOnly)
    }, async (args) => {
      try {
        return await handler(args || {});
      } catch (error) {
        return {
          ...text({ error: error?.message || String(error) }),
          isError: true
        };
      }
    });

  register('hardfire_status', 'Use HardFire only: read the active local HardFire browser tab, URL, title, viewport, recording state and WebSocket counters.', {}, true,
    async () => text(await controller.status()));

  register('hardfire_open', 'Use HardFire only: open an HTTP or HTTPS URL in the active local HardFire browser tab.', {
    url: z.string().url()
  }, false, async ({ url }) => text(await controller.open(url)));

  register('hardfire_click', 'Use HardFire only: click absolute pixel coordinates in the active local HardFire browser tab.', {
    x: z.number().min(0),
    y: z.number().min(0)
  }, false, async ({ x, y }) => text(await controller.click(x, y)));

  register('hardfire_click_relative', 'Use HardFire only: click normalized coordinates from 0 to 1 in the active local HardFire browser tab.', {
    rx: z.number().min(0).max(1),
    ry: z.number().min(0).max(1)
  }, false, async ({ rx, ry }) => text(await controller.clickRelative(rx, ry)));

  register('hardfire_wait', 'Use HardFire only: wait for the active local HardFire tab to settle.', {
    ms: z.number().int().min(0).max(60000).default(1000)
  }, false, async ({ ms }) => text(await controller.wait(ms)));

  register('hardfire_screenshot', 'Use HardFire only: capture the active local HardFire viewport as a JPEG image.', {
    quality: z.number().int().min(20).max(90).default(65)
  }, true, async ({ quality }) => {
    const bytes = await controller.screenshot(quality);
    return {
      content: [{
        type: 'image',
        mimeType: 'image/jpeg',
        data: bytes.toString('base64')
      }]
    };
  });

  register('hardfire_network_events', 'Use HardFire only: read the most recent HTTP/WebSocket capture produced by HardFire.', {}, true,
    async () => text(controller.networkEvents()));

  register('hardfire_network_clear', 'Use HardFire only: clear HardFire\'s most recent network capture buffer.', {}, false,
    async () => text(controller.networkClear()));

  register('hardfire_record_start', 'Use HardFire only: start a full HAR recording on the active local HardFire game tab. This uses the same recorder as the REC button and does not reload the page.', {}, false,
    async () => text(await controller.recordStart()));

  register('hardfire_record_save', 'Use HardFire only: stop the active HAR recording, save it automatically under Downloads/HardFire-HARs, and return the saved path and capture statistics.', {}, false,
    async () => text(await controller.recordSave()));

  register('hardfire_trigger_and_capture', 'Use HardFire only: perform one click and capture matching HTTP and WebSocket request/response traffic from the active HardFire tab.', {
    url_contains: z.string().max(2000).default('fn=play'),
    rx: z.number().min(0).max(1).optional(),
    ry: z.number().min(0).max(1).optional(),
    x: z.number().min(0).optional(),
    y: z.number().min(0).optional(),
    wait_ms: z.number().int().min(0).max(30000).default(2500)
  }, false, async (args) => text(await controller.triggerAndCapture(args)));

  register('hardfire_sequence', 'Use HardFire only: execute a short ordered sequence of navigation, click, wait, screenshot or capture operations in the active HardFire tab.', {
    steps: z.array(z.object({
      action: z.string(),
      args: z.record(z.string(), z.any()).optional()
    })).max(50)
  }, false, async ({ steps }) => {
    const result = await controller.sequence(steps);
    if (result?.screenshot?.base64) {
      const copy = { ...result, screenshot: { ...result.screenshot } };
      const image = copy.screenshot.base64;
      delete copy.screenshot.base64;
      return {
        content: [
          { type: 'text', text: JSON.stringify(copy) },
          { type: 'image', mimeType: 'image/jpeg', data: image }
        ]
      };
    }
    return text(result);
  });

  return server;
}

async function startLocalMcp(controller, options = {}) {
  const host = options.host || '127.0.0.1';
  let port = Number(options.port ?? process.env.HARDFIRE_MCP_PORT ?? 8765);
  let listening = false;
  let lastError = '';
  let stopping = null;
  const activeRequests = new Set();

  const server = http.createServer(async (req, res) => {
    let protocolServer;
    let transport;
    let closing;
    const cleanup = () => {
      if (!closing) {
        closing = Promise.allSettled([
          Promise.resolve().then(() => protocolServer?.close()),
          Promise.resolve().then(() => transport?.close())
        ]).then(() => activeRequests.delete(cleanup));
      }
      return closing;
    };
    try {
      const url = new URL(req.url || '/', `http://${host}:${port}`);
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'POST, GET, OPTIONS',
          'access-control-allow-headers': 'content-type, mcp-session-id, mcp-protocol-version'
        });
        res.end();
        return;
      }
      if (url.pathname === '/health') {
        json(res, 200, { ok: true, service: 'hardfire-local-mcp', endpoint: `http://${host}:${port}/mcp` });
        return;
      }
      if (url.pathname !== '/mcp') {
        json(res, 404, { error: 'not found' });
        return;
      }
      if (req.method !== 'POST') {
        json(res, 405, { error: 'HardFire local MCP uses Streamable HTTP POST requests.' });
        return;
      }

      const { StreamableHTTPServerTransport } = await import('@modelcontextprotocol/sdk/server/streamableHttp.js');
      protocolServer = await createProtocolServer(controller);
      if (res.destroyed) return;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });
      activeRequests.add(cleanup);
      res.once('close', () => { void cleanup(); });
      await protocolServer.connect(transport);
      // Let the SDK enforce content types, bounded body reads and JSON-RPC errors.
      await transport.handleRequest(req, res);
    } catch (error) {
      lastError = error?.message || String(error);
      if (!res.headersSent && !res.destroyed) json(res, 500, { error: lastError });
      else if (!res.writableEnded) res.end();
    } finally {
      await cleanup();
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      port = server.address().port;
      listening = true;
      resolve();
    });
  });

  return {
    endpoint: `http://${host}:${port}/mcp`,
    health: `http://${host}:${port}/health`,
    state() {
      return { listening, host, port, endpoint: `http://${host}:${port}/mcp`, error: lastError };
    },
    stop() {
      if (stopping) return stopping;
      listening = false;
      stopping = (async () => {
        const closed = new Promise((resolve) => server.close(() => resolve()));
        server.closeAllConnections();
        await Promise.allSettled([...activeRequests].map((cleanup) => cleanup()));
        await closed;
      })();
      return stopping;
    }
  };
}

module.exports = { startLocalMcp, createProtocolServer };
