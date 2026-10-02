# HardFire ChatGPT Bridge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for direct execution, or superpowers:subagent-driven-development only if the user selects delegated execution. Steps use checkbox syntax for tracking.

**Goal:** Hacer invocables en ChatGPT las 25 herramientas de HardFire, preservando el navegador local y la conexión de Codex.

**Architecture:** Agente Node WSS saliente con agent_id hardfire, que llama al puente MCP stdio existente. Worker OAuth independiente que anuncia el catálogo generado y devuelve resultados MCP, imágenes y estados de operaciones largas. Reutilizar el control de Firetrace sólo bajo su contrato comprobado.

**Tech Stack:** Node 24/26, SDK MCP 1.31.0 y Zod 4.6.5 existentes. Worker ESM con OAuth provider 1.2.1, Wrangler 4.143.0 y pruebas Workers según el proyecto Firetrace verificado. Cliente ws con versión soportada fijada tras comprobar documentación oficial; necesario para cabeceras de autenticación WSS, sin poner secretos en URL.

**Spec:** ../specs/2026-10-02-hardfire-chatgpt-bridge-design.md

## Global Constraints

- 25 herramientas originales con nombres, esquemas y anotaciones intactos; remoto añade sólo hardfire_command_result, total 26.
- Browser y puerto 8765 continúan en loopback. Órdenes y resultados pasan por Cloudflare; describirlo en consentimiento y documentación.
- Agente exclusivo hardfire. No cambiar el Worker Firetrace, su agente, sus permisos ni el control compartido sin revisar una incompatibilidad descubierta.
- Conservar el ID privado plugins_6abf3f5e07a881919ac5d7e863ebd107 y el registro MCP stdio de Codex.
- Ningún secreto en archivos versionados o salidas; credenciales sólo en configuración local y secretos Worker.
- Mantener el clon aislado y PR existentes. No fusionar PR ni reiniciar Codex/HardFire o cerrar pestañas del usuario para instalar.
- Límites de transporte compatibles con control existente: resultado JSON 1.500.000 bytes; backlog 18 MiB; IDs deduplicados 2.048; comprobar límites reales antes de integrar. Capturas grandes usan ruta binaria de control y referencia por command ID.
- No reintentar acciones de efectos inciertos. Resultado running/unknown se consulta por ID. Esperas locales hasta 60 s continúan tras una ventana RPC de 25 s sin volver a ejecutarse.
- La depuración consola/HTTP/WebSocket queda como entrega posterior: este plan repara la conexión de las herramientas ya implementadas.

## Review Focus

1. Resultado completado antes de started: finished_at y resultado prevalecen; nunca repetir la acción (Task 3).
2. La conexión cae después del clic y antes del ACK: retransmitir sólo el resultado (Task 2).
3. Screenshot y resultado llegan fuera de orden: devolver imagen de la orden exacta y del agente hardfire (Task 3).
4. Browser cerrado pero agente vivo: arrancar invisible al llamar herramienta; agente cerrado devuelve desconexión (Tasks 1/2).
5. ChatGPT conserva catálogo viejo: distinguir servidor desplegado de importación efectiva, sin declarar éxito por archivos instalados (Task 5).

## Task 1: Cliente MCP local del agente

**Files:** crear src/chatgpt/local-client.js, test/chatgpt-local-client.test.js; modificar package.json para comprobar sintaxis del módulo.

**Interfaces:** createLocalClient({bridgePath,nodePath,clientFactory?}) devuelve connect(), listTools(), callTool(name,args,{signal}={}), close(). callTool devuelve CallToolResult intacto. Consumo de plugin/HardFire/mcp/bridge.cjs mediante SDK StdioClientTransport.

- [ ] Escribir prueba test_preserves_mcp_results: assert.deepEqual(await client.callTool('hardfire_status',{}), fixtureResult); incluir isError, texto e imagen. test_rejects_unknown_tool comprueba que no se envía comando. test_offline_browser_uses_existing_launcher comprueba catálogo disponible y arranque oculto a través del puente real, con perfil aislado.
- [ ] Ejecutar rtk proxy node --test test/chatgpt-local-client.test.js y confirmar fallo por módulo ausente.
- [ ] Implementar el cliente; sin conversión de nombres ni selección de pestaña. Un cierre/reconexión del transporte invalida cliente, no reinicia silenciosamente órdenes en curso.
- [ ] Repetir prueba y rtk npm run check. Commit feat: add local MCP client for ChatGPT relay.

## Task 2: Agente WSS y ciclo de vida

**Files:** crear src/chatgpt/control-protocol.js, src/chatgpt/relay-agent.js, scripts/hardfire-chatgpt-agent.cjs, scripts/start-chatgpt-agent.ps1, test/chatgpt-relay-agent.test.js; ampliar .gitignore y package.json.

**Interfaces:** createRelayAgent({client,socketFactory,config,clock,random}) devuelve start(), stop(), state(). Protocol encoder/decoder valida hello, command, started, result, result_ack y screenshot metadata según control existente. Variables HARDFIRE_CONTROL_URL/TOKEN, con fallback CF_CONTROL_URL/TOKEN; agent_id fijo hardfire. Releer configuración persistida de usuario en launcher, sin imprimir valores.

- [ ] Pruebas RED: dos entregas del mismo ID invocan client.callTool exactamente una vez; caída antes de result_ack conserva y reenvía resultado, sin ejecutar de nuevo; backlog saturado rechaza nuevas órdenes antes de efectos; mensajes/IDs inválidos no actúan. test_secret_not_logged; test_single_agent_lock; test_reconnect_delay comprueba espera 1–30 s con jitter y heartbeat 30 s.
- [ ] Ejecutar rtk proxy node --test test/chatgpt-relay-agent.test.js y confirmar ausencia de comportamiento.
- [ ] Implementar conexión saliente, exclusión de doble agente, salud y shutdown. Validar cabeceras/token y límites reales con fixture de protocolo del control; si el contrato exige cambios compartidos, detener despliegue y registrar diferencia. Estado anuncia versión, lista de capacidades y estado real del cliente. Consultar status después de completar una orden cuando corresponda, no ejecutar navegación para obtener salud.
- [ ] Resultado en memoria acotada: 2.048 IDs y 18 MiB de resultados sin ACK; límite 1.500.000 bytes por JSON. Al exceso tras acción devolver result_too_large con efecto incierto. Imágenes usan la ruta binaria correlacionada. Después de reinicio no afirmar exactly-once ni retransmitir acciones antiguas automáticamente.
- [ ] Repetir pruebas y suite. Probar WSS de fixture, incluyendo browser cerrado/agente vivo y parada exclusiva del propio proceso. Commit feat: relay HardFire commands over authenticated WSS.

## Task 3: Worker MCP con catálogo generado

**Files:** crear cloudflare/package.json, cloudflare/src/mcp.js, cloudflare/src/bridge.js, cloudflare/catalog.json, cloudflare/wrangler.jsonc, cloudflare/test/mcp.test.js, cloudflare/test/bridge.test.js; crear scripts/export-chatgpt-tools.js.

**Interfaces:** generateCatalog() copia el catálogo local verificando hash y contenido; createServer(env) anuncia 25 herramientas más hardfire_command_result. runCommand(env,name,args) devuelve resultado completado o {status:'running',command_id}; readCommand(env,id) verifica agente y devuelve estado/CallToolResult. Endpoint /mcp HTTP streamable autenticado.

- [ ] RED: assert.deepEqual(browserTools,localCatalog); assert.equal(allTools.length,26). Orden dirigida sólo a hardfire; rechazar ID de firetrace. test_running_result_does_not_repeat; test_finished_beats_late_started; test_screenshot_is_command_scoped incluye resultados fuera de orden y key de otro agente. Passthrough isError y content sin doble serialización.
- [ ] Ejecutar pruebas Worker y confirmar ausencia del servidor.
- [ ] Implementar con SDK Server y handlers tools/list y tools/call, preservando JSON Schema del catálogo sin conversión manual a Zod. Control /api/rpc wait_ms 25000, require_online true. Desconexión devuelve mensaje preciso; no dice not installed. No pedir latest screenshot global. hardfire_command_result acepta únicamente ID validado y comprueba pertenencia hardfire.
- [ ] Añadir protección de tamaños, resultados pendientes y errores sanitizados del control. Cancelación sólo se anuncia cuando existe entrega verificable al AbortSignal local; si no, documentar operación en curso y consulta de estado.
- [ ] Repetir pruebas, npm check/dry-run del Worker. Commit feat: expose HardFire catalog through dedicated remote MCP.

## Task 4: OAuth y verificación integral

**Files:** crear cloudflare/src/index.js, cloudflare/src/brand.js, cloudflare/test/oauth.test.js, cloudflare/smoke.mjs, cloudflare/README.md; crear scripts/check-chatgpt-relay.js y test/fixtures/chatgpt-relay/.

**Interfaces:** handleMcp protegido por props.agentId hardfire y scope browser:control. Adaptar patrón probado Firetrace con PUBLIC_URL propio, KV OAuth propio y clave MCP_PASSWORD separada. Secrets CONTROL_TOKEN y MCP_PASSWORD no versionados.

- [ ] RED contra runtime Workers: 401 sin token y discovery OAuth; rechazo Origin/consent cookie inválidos, clave incorrecta, scope/agent incorrectos y redirect inválido; registro dinámico, PKCE, refresh y revoke. test_consent_discloses_cloud_transport.
- [ ] Ejecutar pruebas y confirmar que las garantías fallan antes de implementar.
- [ ] Adaptar OAuth Firetrace conservando las comprobaciones; consentimiento enumera control/entrada/captura/tráfico y tránsito por Cloudflare. No aceptar URL del MCP/control proporcionada por llamadas del modelo.
- [ ] Fixture integral conecta agente y Worker de prueba, invoca status, launch true/false, tabs, screenshot y wait_for >25 s con consulta diferida. Confirma HAR existente intacto, otra pestaña intacta y Firetrace sin llamadas. Limpieza mata sólo procesos del fixture.
- [ ] Ejecutar suite HardFire completa y Worker, inspeccionar captura. Commit test: verify OAuth and end-to-end HardFire relay.

## Task 5: Despliegue, conexión real de ChatGPT e instalación

**Files:** modificar README.md, plugin/HardFire/plugin.json, .codex-plugin/plugin.json y skills/hardfire/SKILL.md; añadir .app.json sólo con ID registrado real. Ampliar CI para pruebas cloudflare; preparar outputs/HardFire-ChatGPT-entrega.md.

- [ ] Antes de publicar, obtener revisión independiente final y corregir hallazgos. Confirmar permisos Cloudflare y bindings reales, comprobar salud de Firetrace sin acciones de navegador, guardar metadata privada y versión previa. No copiar el KV OAuth de Firetrace como KV exclusivo de HardFire.
- [ ] Crear/configurar recursos propios y desplegar hardfire-mcp con autenticación. Prueba smoke OAuth de producción: 26 herramientas, status, imagen de orden exacta y consulta de operación larga; tokens de prueba revocados al terminar.
- [ ] Instalar agente local y dejarlo iniciado sin ventana. Copia previa y forma explícita de detenerlo. Conservar MCP local, navegador y sesiones de usuario. No añadir arranque al iniciar Windows salvo petición del usuario.
- [ ] Completar flujo soportado de registro de servidor en ChatGPT. Si exige consentimiento/interacción humana, proporcionar endpoint listo, instrucciones y motivo en ese momento. Guardar app ID real y vincularlo al complemento privado existente; preservar identidad/audiencia. No sustituir IDs por el nombre de un Worker.
- [ ] Refrescar metadatos de la conexión y comprobar 26 herramientas en el host. El usuario autoriza la prueba benigna de status/captura; no enviar mensajes a otro chat sin autorización. La entrega puede marcarse operativa sólo tras una llamada efectiva desde ChatGPT. Si queda bloqueado el registro, informar exactamente qué paso falta, sin prometer solución por reiniciar.
- [ ] Publicar rama en PR existente y comprobar CI, actualizar complemento privado y leer metadata final. Documentar endpoint, agent start/stop, límites/cancelación y rollback; no guardar secretos. Commit final de integración y entrega. Mantener PR sin fusionar.

## Self-review

Spec cubierto: agente y autoarranque Task 1/2; transporte/autenticación Task 2/4; catálogo e imágenes Task 3; incertidumbre y esperas Task 2/3/4; privacidad y consentimiento Task 4; instalación, compatibilidad y verificación ChatGPT Task 5. La posibilidad de modificación del control compartido se trata como cambio de alcance antes de desplegar, no como permiso implícito.

## Execution handoff

Recomendación: ejecución directa en este chat, tareas secuenciales y una revisión independiente final. El cliente, agente y Worker comparten contratos; este método conserva contexto y evita varios implementadores editando la misma integración.
