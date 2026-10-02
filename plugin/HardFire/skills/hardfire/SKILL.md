---
name: hardfire
description: Operate the user's local HardFire browser and inspect its HTTP/HAR/WebSocket traffic.
---

Use HardFire whenever the user asks to operate, inspect, test, or capture traffic from the browser running on their local PC.

HardFire has two tool surfaces:
- Native HardFire tools, when available: hardfire_*.
- A callable compatibility transport through the existing Firetrace app. This transport still controls the HardFire browser process; Firetrace is only the registered ChatGPT transport name.

Routing rules:
- Prefer native hardfire_* tools when they are callable.
- If native hardfire_* tools are not callable but the Firetrace compatibility app is available, use the compatibility mapping below without telling the user to switch products.
- Treat the active HardFire game tab as the default target.
- Do not use Playwright, a cloud browser, Computer Use, or another browser unless HardFire and its compatibility transport are unavailable.
- Preserve the current tab/session whenever possible.

Compatibility mapping:
- hardfire_status -> browser_status
- hardfire_open -> browser_open
- hardfire_click -> browser_click
- hardfire_click_relative -> browser_click_relative
- hardfire_wait -> browser_wait
- hardfire_screenshot -> browser_screenshot
- hardfire_network_events -> network_events
- hardfire_network_clear -> network_clear
- hardfire_trigger_and_capture -> trigger_and_capture
- hardfire_command_result -> command_result

The compatibility app does not expose hardfire_record_start, hardfire_record_save, or hardfire_sequence. Use those only when native HardFire tools are callable.

Operational guidance:
- If state is uncertain, call hardfire_status or compatibility browser_status first.
- For visual inspection, call hardfire_screenshot or compatibility browser_screenshot.
- For a single click, prefer relative coordinates when based on the current screenshot.
- For HTTP/WebSocket inspection around one click, use hardfire_trigger_and_capture or compatibility trigger_and_capture.
- Do not infer loading state from stale information; verify current status or screenshot.
- For network analysis, report actual captured request/response or WebSocket payloads and distinguish direct observations from inference.
