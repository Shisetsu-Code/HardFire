# HardFire

HardFire is an Electron/Chromium browser for browser automation, full HAR capture and WebSocket inspection.

It exposes two MCP paths for different clients:

```text
ChatGPT
  -> https://hardfire-mcp.braian-n-l.workers.dev/mcp
  -> OAuth-protected Cloudflare MCP
  -> shisetsu-browser-control
  -> outbound WSS agent_id=hardfire
  -> HardFire on the user's PC

GPT Worker / direct local MCP client
  -> http://127.0.0.1:8765/mcp
  -> HardFire on the user's PC
```

The PC does not expose an inbound Internet port. The remote path is initiated by HardFire as an outbound WSS connection.

## Run locally

```powershell
cd C:\HardFire
git pull
npm install
npm run check
npm start
```

Local MCP health:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

## Remote control configuration

HardFire reads these preferred Windows/user environment values:

```text
HARDFIRE_CONTROL_URL
HARDFIRE_CONTROL_TOKEN
HARDFIRE_AGENT_ID
```

For migration it can reuse:

```text
CF_CONTROL_URL
CF_CONTROL_TOKEN
FIRETRACE_CONTROL_URL
FIRETRACE_CONTROL_TOKEN
```

The default HardFire identity is:

```text
HARDFIRE_AGENT_ID=hardfire
```

It does not reuse the legacy `firetrace` agent id.

## HardFire tools

- `hardfire_status`
- `hardfire_open`
- `hardfire_click`
- `hardfire_click_relative`
- `hardfire_wait`
- `hardfire_screenshot`
- `hardfire_network_events`
- `hardfire_network_clear`
- `hardfire_record_start`
- `hardfire_record_save`
- `hardfire_trigger_and_capture`
- `hardfire_sequence`

The remote MCP additionally exposes `hardfire_command_result` for reading a previously submitted command without repeating it.

## Full HAR recording

`hardfire_record_start` starts the same recorder as the visible **REC** button without reloading the game.

`hardfire_record_save` stops and saves the capture under:

```text
%USERPROFILE%\Downloads\HardFire-HARs\
```

## ChatGPT plugin

Plugin source:

```text
plugin/HardFire/
```

The ChatGPT plugin uses the callable HTTPS MCP:

```text
https://hardfire-mcp.braian-n-l.workers.dev/mcp
```

The localhost MCP remains available independently for GPT Worker and other direct local MCP clients.

Build the plugin ZIP on Windows:

```powershell
npm run plugin:zip
```

## Cloudflare MCP

Source:

```text
cloudflare/
```

Tests:

```powershell
cd cloudflare
npm ci
npm test
npm run check
```

The Worker uses OAuth for ChatGPT and a service binding to the existing `shisetsu-browser-control` control plane.

## Browser features

- Electron/Chromium with GPU acceleration
- resident tabs without background throttling
- 1x / 2x / 4x / 8x runtime acceleration
- complete HTTP request/response HAR capture
- WebSocket frame capture and decoded game transactions
- persistent HAR archive
- rolling `targets.txt` prefetch

No Playwright browser worker is required.
