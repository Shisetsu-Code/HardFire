# HardFire 1.5 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (ejecución directa recomendada) o superpowers:subagent-driven-development si el usuario selecciona ese método. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Entregar automatización estructurada por pestaña, referencias DOM, teclado, esperas y elección explícita de modo invisible, conservando el arranque automático y las sesiones.

**Architecture:** Extender Electron/CDP y el puente stdio existentes. Separar pestañas, conexión CDP, referencias y esperas en módulos acotados; mantener el servidor HTTP como fuente del catálogo MCP. Reutilizar el navegador y el grabador HAR actuales.

**Tech Stack:** Node.js 24, Electron, SDK MCP y Zod ya instalados; sin otro navegador ni dependencias nuevas para automatización.

**Spec:** [Diseño aprobado](HardFire-1.5-diseno.md); copia en el repositorio: `docs/superpowers/specs/2026-10-02-hardfire-structured-automation-design.md`.

## Global Constraints

- Mantener herramientas y contratos 1.4.4 compatibles; agregar `tab_id` opcional sin cambiar llamadas existentes.
- Snapshot/búsquedas: 50 elementos por defecto, máximo 200; 12 KiB por defecto, máximo 64 KiB; cursores ligados a documento y consulta.
- Esperas: 10 segundos por defecto, máximo 60 segundos; calma HTTP de 500 ms por defecto, sin contar WebSockets/streaming persistentes.
- No crear otro navegador ni sustituir el canvas por una representación DOM ficticia.
- Mantener el complemento privado, su identidad y los demás registros MCP.
- Versionar esta entrega como 1.5.0 y regenerar el catálogo antes de empaquetar.
- Perfiles aislados para pruebas reales; no reiniciar conversaciones ni cerrar sesiones de usuario automáticamente.

## Ajuste solicitado: elección de headless

Agregar `hardfire_launch({headless: boolean})`. Con `true`, arrancar o mantener HardFire invisible; con `false`, arrancarlo o mostrarlo visible. Reutilizar la instancia existente. Mantener `hardfire_browser({mode: 'visible'|'hidden'})` para compatibilidad. Ambas herramientas devuelven `headless`, `visible` y estado del navegador.

Agregar `HARDFIRE_HEADLESS=0|1` como preferencia de arranque configurable en el registro local; por defecto 1. El argumento explícito de `hardfire_launch` prevalece para esa llamada; no modificar silenciosamente el registro ni escribir una preferencia permanente. En Windows se conserva el renderizado transparente sin foco; el nombre headless describe el modo sin interfaz visible y sigue requiriendo sesión de escritorio.

## Review Focus

1. Una actualización SPA sustituye el botón: la referencia antigua falla, nunca apunta al reemplazo.
2. Un iframe cambia de proceso/origen: dirigir la llamada a su sesión o informar `unsupported_frame`, nunca actuar en el documento raíz.
3. El usuario cambia de pestaña durante una espera: la llamada mantiene su pestaña original.
4. HAR activo y automatización comparten CDP: terminar una operación no deshabilita dominios ni desconecta al grabador.
5. Un snapshot contiene texto enorme, emojis o miles de controles: limitar trabajo, retención y bytes UTF-8, y señalar truncamiento.

## Task 1: Elección de modo y recuperación del MCP

**Files:** modificar `plugin/HardFire/mcp/launch.cjs`, `bridge.cjs`, `src/browser-window-mode.js`, `src/main.js`, `src/local-mcp.js`; crear `src/local-mcp-manager.js`; ampliar `test/plugin-bridge.test.js`; crear `test/local-mcp-manager.test.js`.

**Interfaces:** `createLauncher(endpoint)` devuelve `ensureBrowser({headless?:boolean} = {})`; `HardFireController.launch(headless:boolean)` devuelve estado; `LocalMcpManager.ensureRunning():Promise<McpHandle>` comparte una sola operación de arranque. `McpHandle` conserva `endpoint`, `state()` y `stop()` existentes.

- [ ] Añadir pruebas que fallen: lanzamiento explícito false llega visible, true invisible, autoarranque sigue preferencia, argumento no booleano no lanza; dos llamadas simultáneas crean una instancia. Recuperar un HTTP detenido sobre el mismo controlador y comprobar que no cambia la pestaña. Endpoint remoto y `HARDFIRE_AUTO_START=0` no lanzan procesos.
- [ ] Ejecutar `rtk proxy node --test test/plugin-bridge.test.js test/local-mcp-manager.test.js`; confirmar fallos por comportamiento ausente.
- [ ] Implementar firmas anteriores. Registrar `hardfire_launch` con `headless:z.boolean()`. Validar su argumento en el puente antes del arranque. En Electron, una segunda instancia oculta solicita `ensureRunning()` cuando ya existe controlador; el servidor sano se reutiliza. Mantener las garantías del bloqueo de instancia y salida secundaria con código 0.
- [ ] Repetir las pruebas y `rtk npm run check`; probar Electron real desde cerrado en ambos modos.
- [ ] Commit: `feat: choose browser launch mode and recover local MCP`.

## Task 2: Pestañas y destino estable

**Files:** crear `src/browser-tabs.js`, `test/browser-tabs.test.js`; modificar `src/main.js`, `src/hardfire-controller.js`, `src/local-mcp.js`, `test/hardfire.test.js`.

**Interfaces:** `BrowserTabs({listTabs,getActiveTab,createTab,activateTab,closeTab})`: `list()`, `resolve(tabId?:number):GameTab`, `new({url?,activate=true}):Promise<TabSummary>`, `activate(id):TabSummary`, `close(id):Promise<{closed:number}>`. `HardFireController.withTab(tabId?:number)` devuelve un controlador de la misma sesión cuyo destino queda resuelto una sola vez. Mantener capturas recientes por pestaña.

- [ ] Añadir pruebas que fallen: listado distingue pestañas internas; ID cerrado falla; activar/cerrar una pestaña interna falla; cerrar una grabación activa no la descarta; llamada dirigida a B no navega A ni cambia selección visual; cambiar selección durante una secuencia no cambia el destino.
- [ ] Ejecutar `rtk proxy node --test test/browser-tabs.test.js test/hardfire.test.js`; confirmar los fallos esperados.
- [ ] Registrar `hardfire_tabs`, `hardfire_tab_new`, `hardfire_tab_activate`, `hardfire_tab_close`. Pasar callbacks reales del mapa de `main.js`. Ampliar `closeTab(id,{createReplacement=true}={})` para que MCP pueda cerrar la última pestaña sin crear reemplazo y la UI conserve su comportamiento actual. Añadir `tab_id` entero positivo opcional a navegación, entrada, captura, grabación y secuencia. Prevalidar todos los destinos de una secuencia antes de actuar.
- [ ] Repetir pruebas y `rtk npm run check`; comprobar dos pestañas reales y HAR intacto.
- [ ] Commit: `feat: target browser actions by stable tab ID`.

## Task 3: Conexión CDP compartida y referencias

**Files:** crear `src/page-connection.js`, `src/element-references.js`, `test/page-connection.test.js`, `test/element-references.test.js`; modificar conexión CDP en `src/hardfire-controller.js` y `src/har-recorder.js` solo en lo necesario.

**Interfaces:** `PageConnection(webContents)`: `send(method,params={},sessionId?)`, `subscribe(listener):unsubscribe`, `acquire():release`, `frames():Promise<FrameSummary[]>`. `ElementReferences(connection,tabId)`: `add(frameId,backendNodeId):ref`, `resolve(ref):Promise<ElementTarget>`, `invalidate(frameId?)`. `ElementTarget` incluye `tabId`, `frameId`, `sessionId`, `backendNodeId` y generación de documento.

- [ ] Añadir pruebas que fallen: documento navegado, frame retirado, nodo desaparecido y ref de otra pestaña devuelven `stale_ref`; soltar automatización no detacha CDP mientras graba HAR; root y sesión de iframe reciben sus propias respuestas; cerrar pestaña elimina listeners y referencias.
- [ ] Ejecutar `rtk proxy node --test test/page-connection.test.js test/element-references.test.js`; confirmar los fallos esperados.
- [ ] Implementar un multiplexor sobre el debugger Electron existente, con sesiones por target y eventos ligados a su sesión. No instalar un segundo listener de webRequest. Compartir la propiedad de la conexión con HAR mediante leases. Invalidation por navegación/retirada de frame; máximo 2.000 referencias por pestaña, con expiración explícita para las desalojadas.
- [ ] Repetir pruebas, suite completa y grabación HAR real mientras se inspecciona una página con iframe de otro origen.
- [ ] Commit: `feat: share CDP sessions and bind element references to documents`.

## Task 4: Snapshot, búsquedas e inspección compacta

**Files:** crear `src/page-snapshot.js`, `src/bounded-results.js`, `test/page-snapshot.test.js`, `test/bounded-results.test.js`; modificar `src/local-mcp.js` y controlador.

**Interfaces:** `PageSnapshot(connection,references)`: `snapshot(options)`, `find(filters,options)`, `inspect(ref,options)`. `options` incluye `limit=50`, `max_bytes=12288`, `cursor?`; salida incluye `elements`, `frames`, `truncated`, `next_cursor`. `boundedResults(items,options)` aplica presupuesto UTF-8 incluyendo metadatos.

- [ ] Añadir pruebas que fallen: controles accesibles y sin etiqueta; filtros combinados sin selección arbitraria; passwords omitidos; canvas señalado; frame no soportado explícito; textos/atributos extensos, emojis y 10.000 nodos no superan límites; cursor de documento/consulta anterior falla; inspección no devuelve el DOM completo.
- [ ] Ejecutar `rtk proxy node --test test/page-snapshot.test.js test/bounded-results.test.js`; confirmar fallos.
- [ ] Combinar accesibilidad CDP y DOM. Acotar recorrido a 10.000 nodos y extracción de texto a 256 caracteres por elemento, atributos a 20 y valores a 256 caracteres. `inspect` devuelve padre y hasta 20 hijos directos. Mantener como máximo 8 páginas de cursor por pestaña, caducidad 60 segundos, sin retener un DOM ilimitado. Registrar `hardfire_snapshot`, `hardfire_find`, `hardfire_inspect_ref`.
- [ ] Repetir pruebas y suite completa; inspeccionar fixture real con frames, overlay y canvas; comprobar manualmente bytes y nombres.
- [ ] Commit: `feat: expose bounded page snapshots and element search`.

## Task 5: Entrada por referencia y teclado

**Files:** crear `src/element-actions.js`, `src/keyboard-input.js`, `test/element-actions.test.js`, `test/keyboard-input.test.js`; modificar controlador y registro MCP.

**Interfaces:** `ElementActions(connection,references)`: `click(ref)`, `fill(ref,value)`. `press(connection,{key,ref?})` valida una tecla o combinación permitida y libera modificadores en finally.

- [ ] Añadir pruebas que fallen: ref retirada no recibe clic; overlay/disabled/hidden devuelven `not_actionable`; fill rechaza no editables; textbox, textarea, contenteditable y formulario con eventos input/change reciben el texto; Unicode preservado; error durante combinación no deja modificadores pulsados; `Control+L` no cambia la barra de HardFire.
- [ ] Ejecutar `rtk proxy node --test test/element-actions.test.js test/keyboard-input.test.js`; confirmar fallos.
- [ ] Scroll/enfoque de elemento por CDP, comprobar geometría y hit test por frame y enviar entrada real; nunca hacer fallback silencioso a `element.click()`. Reemplazar texto editable con selección e inserción de entrada del navegador sin devolver su contenido. Registrar `hardfire_click_ref`, `hardfire_fill_ref`, `hardfire_press` y prevalidar su uso en secuencias.
- [ ] Repetir pruebas, suite completa y fixture Electron real; comparar efectos observables en la página y capturas antes/después.
- [ ] Commit: `feat: interact through element references and keyboard input`.

## Task 6: Esperas por condición y cancelación

**Files:** crear `src/browser-waits.js`, `test/browser-waits.test.js`; modificar controlador, `src/local-mcp.js` y puente para propagar cancelación correctamente.

**Interfaces:** `waitFor(connection,{condition,timeout_ms=10000,idle_ms=500,signal})` devuelve `{matched:true,elapsed_ms,observation}` o error con código `timeout`. La condición es exactamente una de texto, CSS visible, URL parcial, load state o network idle.

- [ ] Añadir pruebas que fallen: condición satisfecha, timeout máximo y cero invá­lido, navegación/cierre, cancelación, cambio de selección visual y tráfico periódico; WebSockets/streaming no impiden calma HTTP; error de página no se convierte en éxito.
- [ ] Ejecutar `rtk proxy node --test test/browser-waits.test.js`; confirmar fallos.
- [ ] Mantener destino resuelto por Task 2. Usar eventos de conexión compartida y comprobaciones DOM acotadas; cancelar listeners/timers al terminar. Propagar `AbortSignal` desde la solicitud MCP y el abort del fetch; no dejar esperas huérfanas cuando el cliente cancela. Registrar `hardfire_wait_for` con discriminated union y timeout 1–60.000 ms.
- [ ] Repetir pruebas y suite completa; probar con HTTP continuo, SSE, WebSocket y elemento que aparece tarde.
- [ ] Commit: `feat: wait for browser conditions with bounded cancellation`.

## Task 7: Integración, publicación y comprobación del host

**Files:** ampliar `test/plugin-bridge.test.js`, `test/local-mcp-http.test.js`; crear `scripts/check-structured-browser.js` y fixtures en `test/fixtures/structured-browser/`; modificar `package.json`, README y documentos del complemento; regenerar `plugin/HardFire/mcp/tools.json`.

- [ ] Añadir prueba fallida SDK que descubre e invoca herramientas nuevas y valida paridad completa de esquemas; fixture real comprueba pestañas, refs caducadas, overlay, inputs, frames, esperas, captura invisible y grabación simultánea.
- [ ] Ejecutar prueba nueva y confirmar que falla antes de su integración final.
- [ ] Regenerar catálogo, documentar modo invisible y diagnóstico de herramientas ausentes, actualizar manifests a 1.5.0 y sintaxis de módulos nuevos en check. No afirmar que un chat tiene MCP solo porque cargó la habilidad. Añadir salida diagnóstica del puente con versión, capacidades y estado, sin secretos ni datos de otras pestañas.
- [ ] Ejecutar `rtk npm run check`, `rtk proxy node scripts/check-structured-browser.js`, `rtk npm run plugin:zip`; revisar capturas y HAR de perfil aislado. Solicitar una revisión independiente final y corregir sus hallazgos antes de publicar.
- [ ] Commit de integración, publicar rama/PR, comprobar CI, instalar mediante flujo soportado y actualizar complemento privado preservando metadata; leer la versión publicada y probar la copia instalada.

## Diagnóstico actual del otro chat

El chat de ChatGPT «Funciones de HardFire» describe herramientas ausentes en su runtime. Este chat de Codex local tiene las herramientas y `hardfire_status` responde conectado. El registro `hardfire` está habilitado, con Node absoluto y el puente en `C:\HardFire\plugin\HardFire\mcp\bridge.cjs`.

La evidencia ubica el fallo del otro chat antes del launcher, en la exposición de MCP al host/conversación. No permite afirmar que sea caché ni que reiniciar lo arregle. Verificar en Settings → MCP servers → hardfire y reiniciar esa conexión; comprobar herramientas en el host local mediante `/mcp`. Si el chat sigue alojado y solo recibe la habilidad, usar un chat local Work/Codex para el MCP stdio. Una conexión remota/túnel para chats alojados sería una integración distinta, sin exponer localhost públicamente por defecto.

## Revisión del plan

Pestañas/destino: Task 2; refs/frames/CDP y HAR: Task 3; representación/límites: Task 4; acciones: Task 5; condiciones/cancelación: Task 6; arranque/modo/recovery: Task 1; paquete/host/validación: Task 7. La depuración incremental y funciones avanzadas siguen como entregas posteriores del diseño aprobado.

Recomendación de ejecución: directa en este chat, tareas secuenciales y una revisión independiente al final, porque comparten contratos de pestañas, referencias y sesiones CDP.
