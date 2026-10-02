# HardFire

HardFire combines the Firetrace control plane with the native Hard Browser engine.

It replaces the old `Playwright -> Chrome` layer with one Electron/Chromium process using `WebContentsView + CDP + HarRecorder`.

## What stays compatible

The Firetrace command contract is preserved:

- `browser_status`
- `browser_open`
- `browser_click`
- `browser_click_relative`
- `browser_wait`
- `browser_screenshot`
- `network_events`
- `network_clear`
- `trigger_and_capture`
- `sequence`

The Cloudflare worker under `cloudflare/` keeps using the legacy agent id `firetrace` by default. Existing Firetrace MCP deployments can therefore control HardFire without changing the remote command schema.

Do not run the old Firetrace worker and HardFire at the same time with the same agent id.

## Browser engine

HardFire includes the current Hard Browser functionality:

- Chromium/Electron hardware acceleration
- resident background game tabs
- runtime speed 1x / 2x / 4x / 8x
- muted game tabs by default
- complete HTTP request/response HAR capture
- passive response body capture
- WebSocket frame capture and decoding
- WebSocket spin/request-response correlation
- persistent HAR archive
- rolling `targets.txt` prefetch
- `Ctrl+T`, `Ctrl+Tab`, `Ctrl+Shift+Tab`, `Ctrl+W`

No Playwright package or Python worker is required.

## Run locally

On Windows:

```powershell
cd C:\HardFire
npm install
npm run check
npm start
```

The app opens three kinds of tabs:

- `IMPORT`: targets.txt and persistent HAR archive
- `MCP`: local/remote MCP connection status
- normal browser/game tabs

## Local MCP for GPT Worker

HardFire starts a Streamable HTTP MCP server bound only to localhost:

```text
http://127.0.0.1:8765/mcp
```

Health endpoint:

```text
http://127.0.0.1:8765/health
```

The permanent `MCP` tab shows the active endpoint and provides copy buttons.

A generic GPT Worker MCP configuration is:

```json
{
  "mcpServers": {
    "hardfire": {
      "type": "streamable-http",
      "url": "http://127.0.0.1:8765/mcp"
    }
  }
}
```

Change the local port with:

```powershell
$env:HARDFIRE_MCP_PORT="8766"
npm start
```

The MCP server binds to `127.0.0.1`, not to the LAN or Internet.

## Existing Firetrace Cloudflare connection

HardFire reads the same variables as Firetrace:

```text
CF_CONTROL_URL
CF_CONTROL_TOKEN
FIRETRACE_CONTROL_URL
FIRETRACE_CONTROL_TOKEN
FIRETRACE_AGENT_ID
```

The Firetrace-specific values override the generic values.

Default agent id:

```text
firetrace
```

On Windows HardFire also reads persisted user environment values from `HKCU\Environment`, so it can reuse credentials configured for the previous Firetrace worker.

Remote path:

```text
ChatGPT MCP
   -> Cloudflare Worker / Durable Object
   -> outbound WSS
   -> HardFire
   -> native Electron/CDP browser
```

No browser debugging port is exposed externally.

## trigger_and_capture

`trigger_and_capture` no longer creates a Playwright CDP session.

HardFire starts a native `HarRecorder` on the active tab, performs the requested click using Chromium `Input.dispatchMouseEvent`, waits for the requested interval, then returns matching protocol traffic.

It can return:

- request URL/method/headers
- request POST body
- response status/headers
- complete response body when Chromium exposes it
- WebSocket frames
- decoded WebSocket transactions/spins

Sensitive authorization/cookie/API-key headers are redacted before command results leave the browser process.

## Cloudflare MCP development

The original Firetrace MCP worker is preserved under `cloudflare/`.

```powershell
cd cloudflare
npm ci
npm test
npm run check
```

Deploy:

```powershell
npx wrangler deploy
```

## Windows installer

Build locally:

```powershell
npm run dist:win
```

The installer is written to `dist/`.

Release through GitHub Actions:

```powershell
git tag v1.0.0
git push origin v1.0.0
```

The installed application uses the HardFire GitHub repository for automatic updates.

## Repository layout

```text
src/
  main.js                  Hard Browser application
  hardfire-controller.js   Firetrace command adapter
  local-mcp.js             localhost MCP for GPT Worker
  remote-agent.js          Firetrace-compatible Cloudflare WSS agent
  har-recorder.js          HTTP + WS protocol capture
  runtime-controller.js    persistent CDP/runtime state
  mcp/                     local MCP connection UI
  import/                  targets/HAR archive UI
  ui/                      browser chrome
cloudflare/
  src/                     Firetrace-compatible remote MCP worker
test/
  *.test.js                Hard Browser + HardFire tests
```

## Safety

Use HardFire only on systems and services you are authorized to test or automate.


## HardFire ChatGPT plugin

HardFire also ships as a local desktop plugin under `plugin/HardFire/`.

The plugin includes:

- the local HardFire MCP at `http://127.0.0.1:8765/mcp`
- a routing skill that tells ChatGPT to prefer HardFire for local-browser, HAR, network and WebSocket tasks
- namespaced tools such as `hardfire_status`, `hardfire_screenshot` and `hardfire_trigger_and_capture`
- both the portable Agent Plugins manifest and the compatibility Codex manifest

Build an uploadable ZIP on Windows:

```powershell
cd C:\HardFire
npm run plugin:zip
```

Output:

```text
C:\HardFire\dist\HardFire-Plugin.zip
```

After importing/installing the plugin in ChatGPT Desktop, call it with:

```text
@HardFire revisa la pestaña actual y captura el tráfico de la próxima tirada.
```

The skill instructs ChatGPT to use HardFire instead of Firetrace, Playwright, cloud browser tools or unrelated browser integrations when HardFire is intended.
