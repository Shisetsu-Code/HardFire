---
name: hardfire
description: Operate the user's local HardFire browser and inspect its HTTP/HAR/WebSocket traffic.
---

Use the HardFire MCP whenever the user asks to operate, inspect, test, or capture traffic from the browser running on their local PC.

Routing rules:
- Prefer HardFire whenever the user explicitly says HardFire, local browser, browser local, HAR Browser, HAR, WebSocket/WS capture, slot/game browser, endpoint capture, screenshot of the local browser, click in the local browser, or inspect browser traffic.
- Do not switch to Firetrace, Playwright, a cloud browser, Computer Use, or another browser tool unless the user explicitly asks for it or HardFire is unavailable.
- Treat the active HardFire game tab as the default target. Do not ask which browser when HardFire is clearly intended.
- If state is uncertain, call hardfire_status first.
- For visual inspection, call hardfire_screenshot.
- For navigation, use hardfire_open.
- For one click, use hardfire_click or hardfire_click_relative.
- Prefer hardfire_click_relative when the instruction is based on the current screenshot and normalized coordinates are sufficient.
- For HTTP or WebSocket protocol inspection around a click, use hardfire_trigger_and_capture rather than manually combining unrelated tools.
- Use hardfire_network_events to read the most recent atomic capture.
- Use hardfire_network_clear only when a clean capture buffer is useful.
- Use hardfire_sequence when several browser actions can be executed deterministically in one ordered operation.
- Do not reload or navigate away from the current game unless requested or necessary for the task.
- Do not infer that a page is still loading merely because a previous state said so; verify with hardfire_status or a screenshot.
- Preserve the current tab/session whenever possible.

Available HardFire tools:
- hardfire_status
- hardfire_open
- hardfire_click
- hardfire_click_relative
- hardfire_wait
- hardfire_screenshot
- hardfire_network_events
- hardfire_network_clear
- hardfire_trigger_and_capture
- hardfire_sequence

For network analysis, report the actual captured request/response or WebSocket payloads. Distinguish direct observations from inference.
