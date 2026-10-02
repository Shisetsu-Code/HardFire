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

The localhost MCP works with a local execution host and does not require Cloudflare. Chat normal has a separate integration: the existing Firetrace connection can expose HardFire Electron tools through its authenticated relay. Installing a local plugin alone does not make localhost tools available in Chat normal.

## Guía de Electron y Chat normal

La [memoria de aprendizajes](docs/aprendizajes.md) conserva las decisiones y límites de verificación; [Resume](https://github.com/Shisetsu-Code/Resume) reúne el conocimiento de los tres proyectos y una skill reutilizable.

Consulta [la guía en español](docs/electron-firetrace-chat-normal.md) para configurar y comprobar la conexión Firetrace → HardFire Electron, seleccionar ventana visible u oculta, manejar pestañas, capturar HTTP/WebSocket, guardar HAR y reducir las esperas entre acciones.

**Estado de versiones:** esta rama contiene HardFire 1.4.2. La guía describe también las capacidades comprobadas en la instalación local 1.5.1 y el servidor Firetrace 2.1.0. Publicar esta documentación no actualiza el código de esta rama ni instala esas versiones. Consulta `tools/list` para saber qué herramientas expone tu conexión.

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

Use it as `@HardFire` in a host that executes local MCP tools after installing the local marketplace/plugin. For Chat normal through the existing Firetrace connection, see [the integration guide](docs/electron-firetrace-chat-normal.md).

## Browser features

- Electron/Chromium with GPU acceleration
- resident tabs without background throttling
- 1x / 2x / 4x / 8x runtime acceleration
- complete HTTP request/response HAR capture
- WebSocket frame capture and decoded game transactions
- persistent HAR archive
- rolling targets.txt prefetch

No Playwright browser worker is required.
