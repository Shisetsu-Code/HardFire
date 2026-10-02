# HardFire

HardFire is a local Electron/Chromium browser for browser automation, HAR capture and WebSocket inspection through a local MCP.

There is no Cloudflare worker and no remote agent in the current architecture.

## Architecture

```text
ChatGPT Desktop / GPT Worker
        ↓
HardFire plugin
        ↓
Local MCP
http://127.0.0.1:8765/mcp
        ↓
HardFire
        ↓
Electron / CDP / HAR / WebSocket
```

The MCP binds only to `127.0.0.1`.

## Run

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

### Full HAR recording from GPT

Start recording:

```text
hardfire_record_start
```

This uses the same recorder as the visible **REC** button and does not reload the game.

After GPT performs the requested interactions, save it with:

```text
hardfire_record_save
```

The HAR is written automatically to:

```text
%USERPROFILE%\Downloads\HardFire-HARs\
```

The result returns the exact file path, file size, number of HAR entries and capture statistics.

## ChatGPT plugin

The plugin source is under:

```text
plugin/HardFire/
```

Build the ZIP:

```powershell
npm run plugin:zip
```

Output:

```text
C:\HardFire\dist\HardFire-Plugin.zip
```

The plugin includes the local MCP declaration and a routing skill. Use it as:

```text
@HardFire empieza a grabar, haz tres tiradas y guarda el HAR.
```

The skill explicitly prefers HardFire for local browser, HAR, endpoint and WebSocket tasks.

## Browser features

HardFire retains the Hard Browser engine:

- Electron/Chromium with GPU acceleration
- resident tabs without background throttling
- 1x / 2x / 4x / 8x runtime acceleration
- HTTP request and response bodies
- WebSocket frames and decoded game transactions
- WebSocket spin correlation
- persistent HAR archive
- rolling targets.txt prefetch

No Playwright or Python browser worker is required.
