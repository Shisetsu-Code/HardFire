# HardFire MCP para ChatGPT

El navegador HardFire permanece en el PC. ChatGPT llama al Worker MCP autenticado; el control existente transmite la orden por WSS al agente `hardfire`, que utiliza el mismo MCP local que Codex. Las órdenes, resultados y capturas pasan por Cloudflare.

## Catálogo

25 herramientas HardFire idénticas al catálogo local, más `hardfire_command_result({command_id})`. Ante `running` o `unknown`, consultar ese ID; no repetir el clic ni la escritura. No se puede cancelar remotamente una acción ya enviada mediante este contrato de control; el timeout local sigue vigente. No se anuncian capacidades de cancelación remota.

El agente debe permanecer iniciado. Si el navegador está cerrado, su launcher puede iniciarlo invisible; si el agente está cerrado, iniciar el agente en el PC. Una conexión MCP remota no puede arrancar por sí sola un proceso local inexistente.

## Desarrollo

En la raíz: `npm install`, `npm run check`, `npm run check:chatgpt`, `node scripts/check-chatgpt-relay.js` (Electron aislado). En `cloudflare/`: `npm install`, `npm test`, `npm run check`. Exportar el catálogo con `npm run chatgpt:tools`. El catálogo de navegador se genera; no editarlo por separado.

## Instalación y despliegue

Configurar un namespace OAuth KV exclusivo de HardFire en `wrangler.jsonc`. D1/R2 y service binding apuntan al control existente; no se despliega ni modifica ese Worker o Firetrace. Antes de desplegar, comprobar autenticación, cuenta y bindings reales. Crear un `secrets.json` ignorado con CONTROL_TOKEN y una MCP_PASSWORD propia. Desplegar con `wrangler deploy --secrets-file secrets.json`. No introducir el token de control en ChatGPT.

Iniciar el agente en Windows con `scripts/start-chatgpt-agent.ps1`. Relee HARDFIRE_CONTROL_URL/TOKEN o CF_CONTROL_URL/TOKEN del usuario. No configura inicio de Windows. . El agente detecta la pérdida de respuestas de heartbeat y reconecta; una caída del MCP sólo se recupera para llamadas posteriores, sin repetir la acción interrumpida. Logs en `.runtime/chatgpt-agent.log`; lock de instancia en `%USERPROFILE%/.hardfire/chatgpt-agent.lock`. La exclusión la mantiene el sistema mediante un socket exclusivo en 127.0.0.1:18766, liberado incluso tras un cierre abrupto; el archivo PID es sólo diagnóstico. Si el puerto está ocupado, el arranque falla sin desplazar a su propietario. Para detenerlo, identificar el PID de ese lock y verificar que su línea de proceso corresponde a `hardfire-chatgpt-agent.cjs` antes de detenerlo.

La deduplicación conserva hasta 2.048 IDs en memoria, no sobrevive a reinicio. Backlog de resultados sin ACK hasta 18 MiB; JSON hasta 1.500.000 bytes; imágenes JPEG hasta 16 MiB por bloque. La incertidumbre después de un reinicio o una acción sin resultado exige inspección de estado, no un reintento automático.

## Conexión de ChatGPT

Endpoint previsto: https://hardfire-mcp.braian-n-l.workers.dev/mcp. Registrar el servidor en ChatGPT con OAuth, dejar client ID/secret vacíos y completar el consentimiento con la clave de conexión HardFire. El despliegue del Worker no registra automáticamente una app. El complemento privado conserva su identidad; sólo se añade el app ID real devuelto por ese registro.

Después de actualizar, usar Refresh en la conexión para importar catálogo e instrucciones; comprobar 26 herramientas y una llamada real `hardfire_status`. Un paquete instalado o una prueba desde Codex no demuestra que ChatGPT dispone de esa conexión.

`node smoke.mjs` verifica OAuth/PKCE, catálogo, status, refresh y revocación sin imprimir secretos. `HARDFIRE_SMOKE_SCREENSHOT=1` añade una captura del estado actual, sin navegar. Rollback: detener sólo el agente HardFire y restaurar versión previa de su Worker/complemento; el MCP local de Codex y Firetrace siguen independientes.

Procedimiento oficial: https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata
