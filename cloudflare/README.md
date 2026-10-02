# HardFire MCP for ChatGPT

Production endpoint after deploying this Worker:

```text
https://hardfire-mcp.braian-n-l.workers.dev/mcp
```

This is a separate MCP application from the legacy Firetrace MCP.

## Identity

HardFire uses its own identity end to end:

```text
MCP server: HardFire
Cloudflare Worker: hardfire-mcp
agent_id: hardfire
OAuth owner: hardfire-owner
tools: hardfire_*
```

The old Firetrace app and `agent_id=firetrace` are not used by this Worker.

## Authentication

Use OAuth. Leave OAuth client ID and secret empty so dynamic client registration can be used.

The authorization page says **HardFire**, not Firetrace. The separate connection password is stored as the `MCP_PASSWORD` Worker secret.

Do not put `CF_CONTROL_TOKEN` into ChatGPT.

## Architecture

```text
ChatGPT
  -> OAuth-protected HardFire MCP
  -> shisetsu-browser-control service binding
  -> WSS agent hardfire
  -> local HardFire Electron/CDP browser
```

The existing control Worker, D1 database and R2 screenshot bucket are reused, but HardFire has a different agent id and MCP Worker from Firetrace.

## Tools

- `hardfire_status`
- `hardfire_open`
- `hardfire_click`
- `hardfire_click_relative`
- `hardfire_wait`
- `hardfire_screenshot`
- `hardfire_network_events`
- `hardfire_network_clear`
- `hardfire_trigger_and_capture`
- `hardfire_command_result`

## Development

```powershell
cd cloudflare
npm ci
npm test
npm run check
```

Deploy with the required secrets:

```powershell
npx wrangler deploy --secrets-file secrets.json
```

The expected Worker URL is:

```text
https://hardfire-mcp.braian-n-l.workers.dev
```

After deployment, add a **new HardFire app** in ChatGPT using the HardFire endpoint. Do not reuse the old Firetrace app entry.
