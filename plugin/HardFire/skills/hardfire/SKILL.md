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

- hardfire_launch: choose headless true for invisible or false for visible. Reuse the existing browser; never close its tabs to switch modes. HARDFIRE_HEADLESS=0|1 configures automatic startup, default 1. An explicit launch argument overrides it for that call.
- hardfire_tabs, hardfire_tab_new, hardfire_tab_activate, hardfire_tab_close: list and manage game tabs. Internal tabs are protected. Save an active HAR before closing its tab.
- hardfire_snapshot, hardfire_find, hardfire_inspect_ref: read bounded page elements and frames. Prefer these over guessing coordinates for DOM controls. Combine filters to identify the intended element; never choose arbitrarily among ambiguous matches.
- hardfire_click_ref, hardfire_fill_ref, hardfire_press: use current references and browser input. References belong to their tab/frame/document. On stale_ref obtain a fresh snapshot or search; do not silently substitute a similar element. For covered or disabled controls report not_actionable. Navigation uses hardfire_open, not Control+L.
- hardfire_wait_for: wait for one text, CSS, URL, load or network_idle condition. Default timeout 10 seconds, maximum 60; HTTP idle defaults to 500 ms and excludes WebSockets/SSE. Periodic HTTP may prevent idle; prefer an element condition when appropriate.

Pass optional tab_id on page actions to preserve the target. Without it the active game tab is resolved at the start of the call. Explicit invalid IDs never fall back to another tab. A sequence keeps its destination despite selection changes. A tab_new with activate false preserves selection.

Snapshots default to 50 elements and 12 KiB, maximum 200 and 64 KiB. Continue using next_cursor with the same query; a stale_cursor requires a fresh request. Password values are omitted. Check frames and truncation indicators. Canvas controls may require a screenshot and coordinate click; an unsupported frame is not a complete view of the page.
When frames_omitted is positive, extraction_limit explains the frame limit; the snapshot is partial even if elements is empty. Input into rotated frames may return unsupported_frame rather than risk clicking the wrong geometry.

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
