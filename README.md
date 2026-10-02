# HardFire

HardFire is a local Electron/Chromium browser for browser automation, full HAR capture and WebSocket inspection.

## Architecture

```text
ChatGPT Desktop / GPT Worker
        ↓
HardFire local plugin
        ↓
http://127.0.0.1:8765/mcp
        ↓
HardFire
        ↓
Electron / CDP / HAR / WebSocket
```

HardFire does not use Firetrace as a transport and does not require a Cloudflare worker for local Desktop use.

## Run locally

```powershell
cd C:\HardFire
git pull
npm install
npm run check
npm start
```

Health:

```powershell
Invoke-RestMethod http://127.0.0.1:8765/health
```

## Local MCP tools

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

## ChatGPT Desktop plugin

Plugin source:

```text
plugin/HardFire/
```

The plugin declares only the local MCP:

```text
http://127.0.0.1:8765/mcp
```

It has no Firetrace App dependency.

Build the plugin ZIP:

```powershell
npm run plugin:zip
```

Use it locally as `@HardFire` after installing the local marketplace/plugin in ChatGPT Desktop.

## Browser features

- Electron/Chromium with GPU acceleration
- resident tabs without background throttling
- 1x / 2x / 4x / 8x runtime acceleration
- complete HTTP request/response HAR capture
- WebSocket frame capture and decoded game transactions
- persistent HAR archive
- rolling targets.txt prefetch

No Playwright browser worker is required.
