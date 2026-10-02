# HardFire Electron desde Firetrace en Chat normal

## Alcance y versiones

Esta guía recoge la integración comprobada el 2 de octubre de 2026: Chat normal llamó a herramientas `hardfire_*` a través del conector Firetrace y controló el navegador Electron HardFire instalado en el PC.

La instalación comprobada utiliza HardFire **1.5.1** y el servidor MCP Firetrace **2.1.0**. Este servidor anunció **61 herramientas en total**, entre las de Firetrace y las de HardFire; el catálogo local HardFire contiene **25 herramientas**. La conexión remota añade `hardfire_command_result` para consultar resultados pendientes.

La rama del repositorio sobre la que se publica esta guía contiene **1.4.2**. Las herramientas de pestañas, referencias y visibilidad descritas para 1.5.1 requieren esa implementación; no están disponibles por el mero hecho de descargar esta documentación. El catálogo real `tools/list` es la referencia para cada instalación. Esta guía no constituye una nueva versión del programa ni del servidor Firetrace.

## Dos formas de conexión

### Host con ejecución local

Un cliente que ejecuta MCP local puede acceder a `http://127.0.0.1:8765/mcp`. En la instalación 1.5.1, el plugin usa un bridge stdio que anuncia herramientas aunque Electron esté cerrado y puede arrancarlo cuando llega una llamada.

### Chat normal mediante el conector Firetrace existente

```text
Chat normal → conector Firetrace → servidor MCP autenticado existente
                                      ↓
                          relay existente por WSS
                                      ↓
                       agente local HardFire (agent_id: hardfire)
                                      ↓
                       bridge MCP local → Electron/CDP
```

El navegador y los archivos HAR permanecen en el PC. En esta conexión, las órdenes, los resultados y las capturas pasan por la infraestructura Cloudflare existente: el transporte no es exclusivamente localhost. La integración comprobada reutilizó esa infraestructura; no añadió un túnel ni un servicio nuevo.

Selecciona **Firetrace** en Chat normal y pide expresamente usar **HardFire Electron**. Las herramientas `browser_*` de Firetrace siguen controlando su navegador independiente; las herramientas `hardfire_*` controlan Electron. Que `browser_status` responda `connected:true` no demuestra que Electron esté conectado.

## Arranque y actualización del catálogo

En la instalación 1.5.1, `scripts/start-chatgpt-agent.ps1` inicia el agente. Lee `HARDFIRE_CONTROL_URL`/`HARDFIRE_CONTROL_TOKEN`, o sus alternativas `CF_CONTROL_URL`/`CF_CONTROL_TOKEN`, desde la configuración del usuario. No copies tokens en mensajes ni en archivos del repositorio.

El agente debe estar ejecutándose para recibir órdenes remotas. El bridge puede iniciar Electron si está cerrado; no puede recibir una orden si el propio agente está apagado. El script de arranque no configura por sí solo el inicio automático de Windows.

Después de cambiar las herramientas del servidor:

1. Abre la configuración del **conector Firetrace conectado a Chat normal**. Puede coexistir con un plugin local del mismo nombre: comprueba que estás gestionando la conexión remota correcta.
2. Utiliza **Actualizar / Refresh** para importar el nuevo catálogo y sus instrucciones.
3. Vuelve a seleccionar Firetrace en el chat y verifica que aparecen `hardfire_status`, `hardfire_launch`, `hardfire_tabs` y `hardfire_open`.
4. Ejecuta una llamada real; no consideres suficiente que el complemento figure instalado.

El procedimiento oficial de actualización está en [Connect and test your plugin](https://developers.openai.com/plugins/deploy/connect-chatgpt#refresh-metadata).

## Prueba mínima desde Chat normal

Estos ejemplos representan argumentos de herramientas MCP, no comandos de JavaScript para pegar en la página:

```text
hardfire_launch({"headless": false})
hardfire_status({})
hardfire_tabs({})
hardfire_open({"tab_id": <ID devuelto>, "url": "https://example.com"})
hardfire_status({})
hardfire_screenshot({"tab_id": <ID devuelto>, "quality": 70})
```

Comprueba `connected:true`, backend `hard-browser-electron-cdp`, URL y título. La prueba realizada desde «Prueba de juego» abrió la página oficial de Sweet Bonanza, devolvió el título `Play Sweet Bonanza® Slot Demo by Pragmatic Play` y obtuvo una captura JPEG. Esto verifica la navegación a la página; no demuestra que se haya cargado o jugado la demo interactiva. No se hicieron apuestas, compras ni tiradas.

En esa prueba hubo un primer error de visualización `UnknownVizError`; una segunda captura se devolvió correctamente. Repetir una captura de lectura es distinto de repetir un clic cuyo efecto se desconoce.

## Ventana visible y modo oculto

| Herramienta | Uso |
| --- | --- |
| `hardfire_launch({"headless": false})` | Iniciar o mostrar Electron. |
| `hardfire_launch({"headless": true})` | Usar el modo oculto. |
| `hardfire_browser({"mode": "visible"})` | Mostrar la ventana conservando las pestañas. |
| `hardfire_browser({"mode": "hidden"})` | Ocultar la ventana conservando la sesión. |

En HardFire, «headless» designa una ventana Electron oculta con renderizado activo; sigue requiriendo una sesión de escritorio. No es el modo headless de un servidor Chromium sin escritorio. Comprueba la visibilidad actual en `hardfire_status`; si cambia durante el trabajo, vuelve a solicitar el modo deseado. Ocultar la ventana evita molestias, pero no elimina el tiempo de comunicación ni acelera necesariamente las acciones.

## Pestañas y referencias de elementos

| Herramientas | Función |
| --- | --- |
| `hardfire_tabs` | Enumerar pestañas y distinguir internas de las de navegación/juego. |
| `hardfire_tab_new`, `hardfire_tab_activate`, `hardfire_tab_close` | Crear, activar y cerrar una pestaña concreta. |
| `hardfire_snapshot`, `hardfire_find`, `hardfire_inspect_ref` | Leer la página y localizar elementos mediante referencias. |
| `hardfire_click_ref`, `hardfire_fill_ref`, `hardfire_press` | Hacer clic, escribir y usar el teclado sobre elementos identificados. |
| `hardfire_wait_for` | Esperar una condición concreta de texto, CSS, URL, carga o inactividad HTTP. |
| `hardfire_open`, `hardfire_click`, `hardfire_click_relative`, `hardfire_wait` | Navegación, clics por coordenadas y espera temporal. |

Usa el `tab_id` positivo devuelto por las herramientas en las operaciones que lo admiten. No inventes IDs ni uses el `browser_id` de Firetrace como `tab_id` de HardFire. Las pestañas internas no se cierran mediante estas herramientas; antes de cerrar una pestaña que graba, guarda su HAR.

Las referencias de elementos pueden quedar obsoletas al navegar o al eliminarse el elemento. Ante `stale_ref`, vuelve a localizarlo; la referencia no se reasigna automáticamente a otro control.

## Snapshot estructurado frente a captura de pantalla

| Herramienta | Resultado |
| --- | --- |
| `hardfire_snapshot` | Texto y controles estructurados con referencias; **no es una imagen**. |
| `hardfire_screenshot` | Imagen **JPEG**, MIME `image/jpeg`; **no PNG**. |

El snapshot tiene límites y paginación: por defecto 50 elementos y 12 KiB; máximo 200 elementos y 64 KiB por respuesta. No representa el interior visual de un canvas como controles DOM; usa una captura para ese caso. La captura admite `quality`; un valor menor reduce el tamaño a costa del detalle.

## HTTP, WebSocket y HAR

| Herramienta | Función |
| --- | --- |
| `hardfire_network_events` | Consultar la última captura de tráfico HTTP/WebSocket. |
| `hardfire_network_clear` | Limpiar el búfer de la última captura. |
| `hardfire_trigger_and_capture` | Hacer un clic y capturar el tráfico asociado, filtrado por `url_contains`. |
| `hardfire_record_start` | Empezar una grabación HAR completa, sin recargar la página. |
| `hardfire_record_save` | Detener y guardar el HAR, devolviendo ruta y estadísticas. |

Estas herramientas admiten `tab_id` en 1.5.1. `network_events` consulta la captura disponible; no equivale a empezar una grabación continua ni a recuperar todo el tráfico anterior.

`hardfire_trigger_and_capture` admite coordenadas `x`/`y` o relativas `rx`/`ry`, `url_contains` y `wait_ms` (por defecto 2500 ms, máximo 30000). El filtro se aplica al tráfico capturado; no presupongas que todos los sitios usan la misma URL de solicitud.

Los HAR se guardan automáticamente en **Descargas → HardFire-HARs**, usando la carpeta Descargas resuelta por el sistema. La respuesta de `hardfire_record_save` contiene la ruta real; no necesita un diálogo de guardado. La captura incluye solicitudes/respuestas HTTP y mensajes WebSocket mediante extensiones como `_webSocketFrames` y `_webSocketTransactions`. Algunos lectores HAR sólo interpretan los campos HTTP estándar y no muestran esas extensiones.

Para una sesión de diagnóstico:

```text
hardfire_record_start({"tab_id": <ID devuelto>})
... navegación o prueba autorizada ...
hardfire_record_save({"tab_id": <el mismo ID>})
```

Empieza a grabar antes del tráfico que quieres analizar. Una captura iniciada tarde no reconstruye mensajes anteriores. Los tamaños de respuesta y los cuerpos capturados tienen límites; «completa» describe una grabación de sesión, no almacenamiento ilimitado. Revisa los HAR antes de compartirlos: pueden contener datos de la sesión o del sitio.

## Reducir la demora entre acciones

Cada acción separada requiere una decisión del modelo y una ida y vuelta al servidor/agente. Para navegación y pruebas autorizadas:

- Agrupa pasos conocidos con `hardfire_sequence`, hasta 50 pasos, para reducir llamadas. Se ejecutan en orden; no en paralelo ni como una transacción con rollback.
- Usa `hardfire_wait_for` cuando conozcas la condición de finalización, en vez de pausas fijas largas. Las conexiones WebSocket/SSE persistentes no bloquean la condición de inactividad HTTP; el HTTP periódico sí puede bloquearla.
- Evita una captura y un estado después de cada paso si no hacen falta. Conserva el `tab_id` y reutiliza referencias sólo mientras sigan válidas.
- Conserva la pestaña y la sesión; ocultar la ventana no reduce por sí solo la latencia de las llamadas.

Ejemplo de secuencia de navegación, sin interacción con juegos:

```json
{
  "tab_id": 3,
  "steps": [
    {"action": "open", "args": {"url": "https://example.com"}},
    {"action": "wait_for", "args": {"condition": {"type": "text", "value": "Example Domain"}, "timeout_ms": 10000}},
    {"action": "screenshot", "args": {"quality": 65}}
  ]
}
```

Sustituye `3` por un ID real. Ante un resultado remoto pendiente con `command_id`, consulta `hardfire_command_result({"command_id": "..."})`; no repitas la acción original. Si una llamada falla después de enviar una orden, inspecciona el estado antes de decidir qué repetir.

## Diagnóstico rápido

| Síntoma | Comprobación |
| --- | --- |
| Sólo aparecen `browser_*` | Actualizar el catálogo de la conexión remota Firetrace; verificar `tools/list`. |
| Plugin instalado, sin herramientas ejecutables | Distinguir instalación local de conexión disponible en ese Chat normal. |
| Electron desconectado | Comprobar agente HardFire, configuración del relay y disponibilidad del MCP local. |
| Firetrace conectado, pero no Electron | Consultar `hardfire_status`; son agentes y navegadores distintos. |
| Se abre el navegador anterior | Pedir `hardfire_*`; `browser_*` controla Firetrace. |
| Ventana oculta | Solicitar `hardfire_launch(headless:false)` o `hardfire_browser(mode:"visible")`. |
| Referencia obsoleta | Volver a buscar el elemento en la pestaña correcta. |
| HAR sin eventos esperados | Comprobar pestaña y momento de inicio de grabación. |

Un resultado local desde Codex o una prueba directa del servidor no sustituye la comprobación desde Chat normal. La integración se considera comprobada cuando ese chat ejecuta las herramientas HardFire y devuelve resultados del backend Electron.
