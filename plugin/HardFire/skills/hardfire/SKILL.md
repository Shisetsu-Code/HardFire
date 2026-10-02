---
name: hardfire
description: Use when the user asks to operate their local HardFire browser, invoke its installed plugin, or inspect HAR and WebSocket traffic.
---

Use the native HardFire MCP tools for the user's local HardFire browser. The plugin's bundled stdio bridge announces its tools even while the browser is closed, and relays browser actions to the local HTTP MCP at http://127.0.0.1:8765/mcp.

## Check availability

Call hardfire_status first when the state is uncertain. Browser tool calls automatically start the local HardFire installation in hidden mode if needed. Discovery alone does not launch the browser. Reuse the current session when it is already running.

- installed: true with connected: false means the plugin is available but startup failed, is disabled, or its backend is unreachable. Read the diagnostic; check HARDFIRE_APP_PATH or start HardFire manually and retry. Do not tell the user the plugin is missing or ask them to reinstall it for this state.
- connected: true means the local browser responded. Use its actual tab, URL, viewport and recording state.
- If hardfire_* tools are absent from this chat, inspect the local plugin/MCP registration. After installing or changing the transport, reconnect the HardFire MCP or restart the host and test in a new chat. A loaded skill alone does not prove its MCP tools are available.
- Do not substitute another app's browser_status tool for HardFire. Do not infer a successful installation or connection from package files alone.
- This plugin runs on the local Desktop/Codex host with Node.js. A cloud or web-only host cannot reach the PC's loopback endpoint through this package.

## Tools

- hardfire_status: read the browser state without navigating.
- hardfire_browser: use mode visible to show the window or hidden to hide it, preserving tabs and session. Keep it hidden unless the user wants a visible window. Hidden mode still uses Electron in the local desktop session.
- hardfire_open: open an HTTP or HTTPS URL.
- hardfire_click and hardfire_click_relative: click absolute or normalized viewport coordinates.
- hardfire_wait and hardfire_screenshot: wait or inspect the current viewport.
- hardfire_network_events and hardfire_network_clear: inspect or clear the last action's capture.
- hardfire_record_start and hardfire_record_save: control the full HAR recorder used by the REC button.
- hardfire_trigger_and_capture: click once and capture matching HTTP/WebSocket traffic.
- hardfire_sequence: perform a short ordered sequence of supported actions.

Preserve the current tab/session unless the user requests navigation. Prefer relative coordinates when clicking from a screenshot. A failed browser startup does not uninstall the plugin; inspect its diagnostic and retry after correcting the local path or starting HardFire manually.

Use actual captured request/response and WebSocket payloads for network analysis. Do not infer current state from stale screenshots or fabricate traffic. Do not use another browser unless the user requests it or HardFire is unavailable.
