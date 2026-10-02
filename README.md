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

HardFire 1.5 adds `hardfire_launch({headless:true|false})`, four tab tools,
`hardfire_snapshot`, `hardfire_find`, `hardfire_inspect_ref`, `hardfire_click_ref`,
`hardfire_fill_ref`, `hardfire_press` and `hardfire_wait_for`.
Page actions accept an optional positive `tab_id`, resolved once per call.
Internal tabs cannot be closed, and recording tabs require saving their HAR first.

Snapshots default to 50 elements / 12 KiB UTF-8, maximum 200 / 64 KiB;
`max_bytes` accepts 512–65536. Text and attributes are bounded, password values
are omitted, and cursors expire after 60 seconds or a document/query change.
References never remap after navigation or removal: search again on `stale_ref`.
Extraction visits at most 10000 DOM nodes and 32 frames per request, also bounded
by the response budget. `frames_omitted` and `extraction_limit: "frame_limit"`
explicitly identify omitted frames; pagination does not bypass that extraction
limit. Rotated iframe geometry reports `unsupported_frame` for input.
Frames that cannot be inspected report `unsupported_frame`; canvas may require
screenshots. Clics use actual browser input and reject hidden, disabled or covered
elements. Fill supports inputs, textarea and contenteditable without echoing values.

`hardfire_wait_for` accepts `{condition:{type:"text"|"css"|"url"|"load",value:...}}`
or `{condition:{type:"network_idle"}}`. Timeout is 10 seconds by default,
1–60000 ms; idle is 500 ms by default. Persistent WebSocket/SSE connections
are excluded, while periodic HTTP can prevent idle. Cancellation or closing
the target stops the wait; navigation cancels document conditions.

`HARDFIRE_HEADLESS=0|1` chooses automatic startup visibility, default 1.
An explicit launch argument overrides it without changing persistent settings.
If Electron is alive but its HTTP server stopped, the next launcher request
asks that same instance to recover MCP without replacing tabs.

Run `node scripts/check-structured-browser.js` for the real Electron fixture:
isolated profile, two tabs, Unicode input, pagination, frames, overlays,
reference invalidation, waits, hidden screenshots and concurrent HAR recording.

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

The plugin launches its bundled Node.js stdio MCP bridge. It announces the 25 tools
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
