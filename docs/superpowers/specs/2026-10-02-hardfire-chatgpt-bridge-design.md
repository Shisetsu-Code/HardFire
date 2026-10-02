# HardFire — conexión de ChatGPT al navegador local

## Objetivo aprobado

Permitir que ChatGPT invoque las 25 herramientas de HardFire 1.5, incluida la selección visible/invisible, pestañas, referencias y esperas. El navegador continúa ejecutándose en el PC. El alcance inmediato es reparar la integración; la depuración de consola/HTTP/WebSocket solicitada queda pendiente como siguiente entrega y no se presenta como implementada.

## Evidencia y alternativas

El MCP local de HardFire anuncia 25 herramientas y responde conectado. El paquete privado tiene apps vacío y MCP stdio. Firetrace sí proporciona herramientas a ChatGPT mediante su Worker OAuth y un agente local WSS. En este chat su catálogo expuesto contiene 14 herramientas; el repositorio documenta 35, pero esto no prueba por sí solo qué versión está desplegada. El catálogo personal añadido no resolvió la carga de HardFire.

Se recomienda adaptar el diseño del puente Firetrace para HardFire. Cambiar solamente el catálogo local ya se probó sin éxito. Un túnel directo del puerto local añade otra dependencia y exige proteger un endpoint que ahora es privado. No reemplazar el navegador por Firetrace ni atribuirle las herramientas nuevas de HardFire.

## Componentes y contratos

1. Agente local Node de HardFire: proceso independiente del navegador que inicia una conexión WSS saliente al control existente con agent_id hardfire. Reutiliza el puente MCP local mediante SDK; descubre y llama herramientas reales. Puede arrancar HardFire invisible cuando recibe una acción. Si el propio agente está cerrado, ChatGPT informa desconexión: un proceso cerrado no puede arrancarse a sí mismo. Instalación incluye una forma explícita de iniciar/detener el agente; mantenerlo activo durante la verificación.
2. Worker MCP dedicado hardfire-mcp con OAuth, patrón de Firetrace y secretos independientes de autorización. Reutiliza el servicio de control existente solamente si las pruebas demuestran que permite mensajes HardFire sin cambiar su contrato; no modificar Firetrace o el control compartido silenciosamente. Si se necesita modificar ese contrato, revisar el alcance antes de desplegar.
3. Catálogo generado desde plugin/HardFire/mcp/tools.json, conservando nombres hardfire_*, esquemas, descripciones y anotaciones. Comprobar igualdad de las 25 herramientas con el servidor local. Una herramienta adicional hardfire_command_result consulta operaciones largas sin repetirlas: el transporte remoto publica 26 herramientas, 25 de navegador y una de consulta de resultados.
4. Complemento privado existente: conservar ID, identidad, audiencia y acceso local de Codex. Vincular el servidor registrado de ChatGPT mediante el identificador real devuelto por su flujo de conexión. No inventar IDs ni afirmar que editar .app.json registra un servidor. El registro y consentimiento OAuth pueden necesitar interacción del usuario si no existe herramienta soportada para completarlos.

## Entrega y recuperación

Cada orden tiene ID único y destino agent_id hardfire. Los resultados se recuperan sólo bajo ese agente. No volver a ejecutar clics/escrituras tras timeout o desconexión; devolver estado running/unknown y consultar por ID. El agente deduplica IDs dentro de una retención acotada e informa incertidumbre después de reiniciarse, sin prometer ejecución exactamente una vez. Mantener tab_id, ref y contenido MCP sin traducirlos a IDs de Firetrace.

Heartbeat y reconexión exponencial acotada con variación aleatoria; una sola conexión activa por agente instalado. Resultado y errores deben preservar isError y bloques text/image. Capturas se vinculan a la orden exacta, nunca a la última imagen global. Acotar tamaños y descartar explícitamente mensajes que excedan el límite. El transporte reutiliza los límites MCP existentes; no transfiere perfiles ni cookies como sincronización.

Las esperas de hasta 60 segundos usan resultado diferido cuando exceden la ventana RPC. La cancelación remota sólo se anuncia si puede propagarse al AbortSignal local; abandonar la espera de ChatGPT no equivale a deshacer una acción ya ejecutada. Documentar la limitación si el control actual no transporta cancelaciones.

## Autenticación y datos

OAuth protege el MCP público; credenciales de control quedan únicamente en secretos Worker y configuración local, fuera del repositorio y registros. El navegador y puerto 8765 permanecen en loopback. Las órdenes, resultados y capturas solicitadas pasan por Cloudflare como en Firetrace; no describir esta conexión como procesamiento exclusivamente local. No exponer herramientas de shell ni cambios arbitrarios de endpoint desde las llamadas del modelo. Las herramientas permiten navegar, escribir y grabar; preservar ese alcance en el consentimiento.

## Pruebas y criterio de finalización

Pruebas de catálogo, agente, correlación, desconexión, deduplicación, tamaños, imágenes, errores, operaciones largas y autenticación. Fixture local aislado para pestañas y espera, con compatibilidad HAR. Pruebas OAuth contra Workers runtime y smoke del despliegue: descubrimiento de 26 herramientas, status, lanzamiento invisible/visible y captura del mismo navegador local, sin efectos en Firetrace.

Verificar el catálogo desplegado y después la conexión real de ChatGPT. Actualizar/refresh metadata si la conexión conserva un catálogo anterior, usando el procedimiento oficial. Una aprobación de despliegue no demuestra que ChatGPT importó las herramientas. No declarar reparación completa hasta observar una llamada desde ChatGPT o informar precisamente qué paso de registro queda pendiente.

Mantener fuente en el repositorio HardFire y PR existente; mantener complemento privado y copia previa. No cerrar la sesión de usuario durante instalación. Conservar el MCP stdio de Codex y preparar rollback del agente/Worker sin modificar la conexión de Firetrace.

## Próximo paso

Revisión de esta especificación; después preparar plan de implementación con rutas, pruebas y secuencia de despliegue. Ejecución directa recomendada por los contratos compartidos, con una revisión independiente final. Registro/consentimiento de ChatGPT sólo se solicita cuando el endpoint esté implementado, probado y listo.
