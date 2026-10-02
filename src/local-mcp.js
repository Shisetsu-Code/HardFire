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

async function createProtocolServer(controller, requestSignal) {
  const [{ McpServer }, { z }] = await Promise.all([
    import('@modelcontextprotocol/sdk/server/mcp.js'),
    import('zod')
  ]);

  const server = new McpServer({ name: 'HardFire', version });
  const scoped = (args) => controller.withTab ? controller.withTab(args.tab_id) : controller;
  const tabSchema = {tab_id:z.number().int().positive().optional()};
  const pageSchema = {limit:z.number().int().min(1).max(200).default(50),max_bytes:z.number().int().min(512).max(65536).default(12288),cursor:z.string().max(100).optional()};
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
      inputSchema: ['hardfire_status','hardfire_browser','hardfire_launch','hardfire_tabs','hardfire_tab_new','hardfire_tab_activate','hardfire_tab_close'].includes(name) ? inputSchema : {...inputSchema,...tabSchema},
      annotations: annotations(readOnly)
    }, async (args, extra) => {
      try {
        const signals=[requestSignal,extra?.signal].filter(Boolean);
        return await handler(args || {},signals.length ? AbortSignal.any(signals):undefined);
      } catch (error) {
        return {
          ...text({ error: error?.message || String(error),code:error?.code,observation:error?.observation }),
          isError: true
        };
      }
    });

  register('hardfire_status', 'Use HardFire only: read the active local HardFire browser tab, URL, title, viewport, recording state and WebSocket counters.', {}, true,
    async () => text(await controller.status()));

  register('hardfire_browser', 'Start HardFire if needed, then show or hide its browser window without closing tabs or losing the session. Hidden mode keeps browser automation active without a visible window.', {
    mode: z.enum(['visible', 'hidden'])
  }, false, async ({ mode }) => text(await controller.browser(mode)));

  register('hardfire_launch', 'Start or reuse HardFire. Choose headless=true for an invisible browser or false to show it.', {
    headless: z.boolean()
  }, false, async ({ headless }) => text(await controller.launch(headless)));

  register('hardfire_tabs', 'List HardFire tabs, distinguishing internal tabs from game tabs.', {}, true, async () => text({tabs:controller.tabs.list()}));
  register('hardfire_wait_for', 'Wait for one browser condition with a bounded timeout. Persistent WebSockets and SSE do not block HTTP idle.', {
    condition:z.discriminatedUnion('type',[
      ...['text','css','url'].map(type=>z.object({type:z.literal(type),value:z.string().min(1).max(2000)})),
      z.object({type:z.literal('load'),value:z.enum(['interactive','complete'])}),z.object({type:z.literal('network_idle')})
    ]),timeout_ms:z.number().int().min(1).max(60000).default(10000),idle_ms:z.number().int().min(1).max(60000).default(500)
  }, true, async(args,signal)=>text(await scoped(args).waitFor({...args,signal})));
  register('hardfire_click_ref', 'Send a real browser click to a current, visible, enabled and uncovered element.', {ref:z.string().max(100)}, false, async args=>text(await scoped(args).clickRef(args.ref)));
  register('hardfire_fill_ref', 'Replace editable text using browser input. Does not return the entered value.', {ref:z.string().max(100),value:z.string().max(65536)}, false, async args=>text(await scoped(args).fillRef(args.ref,args.value)));
  register('hardfire_press', 'Send a key or combination to the page or optional element reference. Navigation uses hardfire_open.', {key:z.string().max(60),ref:z.string().max(100).optional()}, false, async args=>text(await scoped(args).press(args)));
  register('hardfire_snapshot', 'Read bounded page controls and text with stable element references. Canvas may require screenshots.', pageSchema, true, async args=>text(await scoped(args).page().snapshot.snapshot(args)));
  register('hardfire_find', 'Find elements using all supplied filters. Returns matches without choosing or clicking one.', {...pageSchema,
    role:z.string().max(256).optional(),name:z.string().max(256).optional(),text:z.string().max(256).optional(),css:z.string().max(2000).optional(),placeholder:z.string().max(256).optional(),visible:z.boolean().default(true)
  }, true, async args=>{const {role,name,text:needle,css,placeholder,visible}=args;return text(await scoped(args).page().snapshot.find(Object.fromEntries(Object.entries({role,name,text:needle,css,placeholder,visible}).filter(([,value])=>value!==undefined)),args));});
  register('hardfire_inspect_ref', 'Inspect one current reference with bounded attributes, parent and direct children.', {ref:z.string().max(100),max_bytes:pageSchema.max_bytes}, true, async args=>text(await scoped(args).page().snapshot.inspect(args.ref,args)));
  register('hardfire_tab_new', 'Create a game tab, optionally without changing selection.', {url:z.string().url().optional(),activate:z.boolean().default(true)}, false, async args=>text(await controller.tabs.new(args)));
  register('hardfire_tab_activate', 'Select an existing game tab.', {tab_id:z.number().int().positive()}, false, async args=>text(controller.tabs.activate(args.tab_id)));
  register('hardfire_tab_close', 'Close a game tab. Save an active HAR recording first.', {tab_id:z.number().int().positive()}, false, async args=>text(await controller.tabs.close(args.tab_id)));

  register('hardfire_open', 'Use HardFire only: open an HTTP or HTTPS URL in the active local HardFire browser tab.', {
    url: z.string().url()
  }, false, async (args) => text(await scoped(args).open(args.url)));

  register('hardfire_click', 'Use HardFire only: click absolute pixel coordinates in the active local HardFire browser tab.', {
    x: z.number().min(0),
    y: z.number().min(0)
  }, false, async (args) => text(await scoped(args).click(args.x, args.y)));

  register('hardfire_click_relative', 'Use HardFire only: click normalized coordinates from 0 to 1 in the active local HardFire browser tab.', {
    rx: z.number().min(0).max(1),
    ry: z.number().min(0).max(1)
  }, false, async (args) => text(await scoped(args).clickRelative(args.rx, args.ry)));

  register('hardfire_wait', 'Use HardFire only: wait for the active local HardFire tab to settle.', {
    ms: z.number().int().min(0).max(60000).default(1000)
  }, false, async (args) => text(await scoped(args).wait(args.ms)));

  register('hardfire_screenshot', 'Use HardFire only: capture the active local HardFire viewport as a JPEG image.', {
    quality: z.number().int().min(20).max(90).default(65)
  }, true, async (args) => {
    const bytes = await scoped(args).screenshot(args.quality);
    return {
      content: [{
        type: 'image',
        mimeType: 'image/jpeg',
        data: bytes.toString('base64')
      }]
    };
  });

  register('hardfire_network_events', 'Use HardFire only: read the most recent HTTP/WebSocket capture produced by HardFire.', {}, true,
    async (args) => text(scoped(args).networkEvents()));

  register('hardfire_network_clear', 'Use HardFire only: clear HardFire\'s most recent network capture buffer.', {}, false,
    async (args) => text(scoped(args).networkClear()));

  register('hardfire_record_start', 'Use HardFire only: start a full HAR recording on the active local HardFire game tab. This uses the same recorder as the REC button and does not reload the page.', {}, false,
    async (args) => text(await scoped(args).recordStart()));

  register('hardfire_record_save', 'Use HardFire only: stop the active HAR recording, save it automatically under Downloads/HardFire-HARs, and return the saved path and capture statistics.', {}, false,
    async (args) => text(await scoped(args).recordSave()));

  register('hardfire_trigger_and_capture', 'Use HardFire only: perform one click and capture matching HTTP and WebSocket request/response traffic from the active HardFire tab.', {
    url_contains: z.string().max(2000).default('fn=play'),
    rx: z.number().min(0).max(1).optional(),
    ry: z.number().min(0).max(1).optional(),
    x: z.number().min(0).optional(),
    y: z.number().min(0).optional(),
    wait_ms: z.number().int().min(0).max(30000).default(2500)
  }, false, async (args) => text(await scoped(args).triggerAndCapture(args)));

  register('hardfire_sequence', 'Use HardFire only: execute a short ordered sequence of navigation, click, wait, screenshot or capture operations in the active HardFire tab.', {
    steps: z.array(z.object({
      action: z.string(),
      args: z.record(z.string(), z.any()).optional()
    })).max(50)
  }, false, async (args,signal) => {
    const result = await scoped(args).sequence(args.steps,signal);
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
    const requestAbort=new AbortController();
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
      protocolServer = await createProtocolServer(controller, requestAbort.signal);
      if (res.destroyed) return;
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true
      });
      activeRequests.add(cleanup);
      res.once('close', () => { requestAbort.abort();void cleanup(); });
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
