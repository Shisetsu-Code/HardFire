# HardFire

HardFire is a local Electron/Chromium browser for browser automation, full HAR capture and WebSocket inspection.

## Architecture

```text
ChatGPT Desktop / Codex (local host)
        ↓
HardFire local plugin
        ↓
Bundled stdio MCP bridge (discovery works while the browser is closed)
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

The plugin launches its bundled Node.js stdio MCP bridge. It announces the 13 tools
without depending on a running browser and forwards browser actions to:

```text
http://127.0.0.1:8765/mcp
```

It has no Firetrace App dependency.

Install or update the local plugin from the repository root:

```powershell
codex plugin marketplace add .
codex plugin add hardfire@hardfire-local
```

If an older direct HTTP `hardfire` MCP registration exists, update it to the
bridge so tool discovery also survives closing the browser:

```powershell
codex mcp add hardfire -- node C:\HardFire\plugin\HardFire\mcp\bridge.cjs
```

Reconnect the MCP or restart the Desktop host after changing its transport,
then test in a new chat. When a tool is called with HardFire closed, the bridge
starts it in hidden mode and waits for readiness. Existing browser sessions are
reused. Call `hardfire_browser` with `mode: "visible"` or `mode: "hidden"` to show
or hide the window without closing tabs. Hidden mode uses Electron with its window
hidden and background rendering enabled; it still requires a desktop session.
On Windows, it uses a completely transparent window excluded from the taskbar,
without mouse input or focus, so Chromium still renders capturable frames.
Run `npm run start:headless` to start the same mode manually.

The bridge locates the source checkout or, on Windows, `C:\HardFire` and the default
per-user installed executable. Set `HARDFIRE_APP_PATH` to another checkout folder
or installed executable. Set `HARDFIRE_AUTO_START=0` to disable automatic startup.
Custom `HARDFIRE_MCP_URL` endpoints do not auto-start unless `HARDFIRE_APP_PATH`
is also configured, and remote endpoints never launch a local process. If startup
fails, status still reports `installed: true, connected: false` with diagnostics.
This local package requires Node.js 24 and a local execution host. Cloud/web-only
chats cannot access the PC's loopback endpoint through this package.

After changing tool schemas, regenerate the bundled discovery catalog with
`npm run plugin:tools`. The integration tests check it against the live MCP.

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
