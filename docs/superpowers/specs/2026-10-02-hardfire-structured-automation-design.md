# HardFire: automatización estructurada y arranque automático

Fecha: 2 de octubre de 2026. Base: complemento 1.4.4.

## Objetivo acordado

Permitir que Codex opere HardFire mediante información compacta, referencias a elementos y esperas por condición. Mantener capturas y coordenadas para interfaces canvas/WebGL. El complemento debe iniciar el navegador y su MCP local cuando estén cerrados, sin una ventana visible por defecto, y reutilizar la sesión cuando ya exista.

La ampliación se divide en tres entregas. Esta especificación fija el alcance implementable de la primera y deja las siguientes como continuación del mismo objetivo.

## Estado actual verificado

El host inicia el puente MCP stdio del complemento al conectarlo. El puente puede anunciar herramientas sin que Electron esté abierto. Al llamar una herramienta, el launcher inicia HardFire invisible y espera su servidor HTTP local. Electron crea el controlador y el servidor MCP; no hace falta iniciar otro servidor manualmente.

La versión instalada 1.4.4 se probó desde un backend cerrado con un perfil aislado: arranque, descubrimiento de 13 herramientas, navegación, imagen, HAR y cambio de visibilidad conservando la pestaña. En Windows el modo invisible mantiene una ventana completamente transparente, sin foco, ratón ni barra de tareas, para permitir las capturas. Requiere una sesión de escritorio.

Las llamadas simultáneas de un puente comparten el arranque. El bloqueo de instancia única evita duplicar Electron entre puentes. Un proceso secundario que termina normalmente no cancela la espera del servidor principal.

## Decisión de arquitectura

Ampliar el controlador Electron/CDP existente y su puente, conservando el navegador, las sesiones y el grabador HAR. No añadir otro navegador ni un servicio independiente con una segunda sesión.

Separar la gestión de pestañas, las referencias DOM y las esperas en módulos pequeños. El registro de herramientas en `local-mcp.js` seguirá siendo la interfaz MCP. El catálogo del puente se regenerará desde ese servidor para evitar diferencias de esquemas.

Las acciones tendrán `tab_id` opcional; omitirlo selecciona la pestaña de juego activa. Especificarlo permite operar sobre esa pestaña sin cambiar la selección visual. Nunca elegir silenciosamente otra pestaña cuando el ID no exista o esté cerrado. Las pestañas internas de importación y MCP se distinguen de las pestañas de juego y no se cierran con las herramientas de automatización.

## Primera entrega

### Pestañas

- `hardfire_tabs`: listar ID, tipo, título, URL, estado de carga y selección activa.
- `hardfire_tab_new`: crear una pestaña de juego, con URL HTTP/HTTPS opcional; activar solo según el argumento explícito, cuyo valor por defecto será true.
- `hardfire_tab_activate`: seleccionar una pestaña de juego existente.
- `hardfire_tab_close`: cerrar únicamente la pestaña de juego indicada. Si está grabando, devolver un error que indique guardar el HAR primero. Si se cierra la activa, seleccionar otra pestaña de juego; no crear una página de destino arbitraria.

### Representación y referencias

- `hardfire_snapshot`: URL, título, frame IDs, texto visible y controles con referencia, rol, nombre, estado y rectángulo. Combinar accesibilidad y DOM para controles que carezcan de etiquetas adecuadas. No devolver HTML completo ni valores de campos de contraseña.
- `hardfire_find`: buscar por texto, rol, nombre accesible, CSS o placeholder. Los filtros suministrados se combinan; por defecto se devuelven coincidencias visibles. La búsqueda no hace clic y no escoge una coincidencia ambigua.
- `hardfire_inspect_ref`: atributos acotados, estado, rectángulo, padre y una cantidad limitada de hijos del elemento referenciado.

Una referencia opaca pertenece a una pestaña, un frame y una generación de documento. Se invalida al navegar, recargar, cerrar la pestaña o perder ese frame. Si el nodo desaparece durante una actualización DOM, la acción devuelve `stale_ref` y solicita otra búsqueda o snapshot. No reasignar la referencia a un elemento parecido ni aceptar referencias de otra pestaña.

Los frames inaccesibles se indican expresamente. Los frames separados en otros targets CDP deben usar sesiones propias; no presentar una vista parcial como si cubriera toda la página. Detectar canvas/WebGL en el snapshot y señalar que sus controles dibujados pueden requerir captura y coordenadas.

### Acciones

- `hardfire_click_ref`: resolver la referencia, comprobar existencia, visibilidad, habilitación y oclusión, y enviar entrada al punto del elemento. No usar `element.click()` como sustitución silenciosa de un clic real.
- `hardfire_fill_ref`: enfocar y reemplazar el contenido de un campo editable mediante entrada del navegador, con los eventos esperados por aplicaciones web. Rechazar elementos no editables y no devolver el valor escrito.
- `hardfire_press`: teclas y combinaciones permitidas mediante entrada del navegador, dirigidas a la página o a una referencia opcional. Validar la combinación antes de enviar eventos y soltar modificadores aunque falle la operación. No interpretar `Control+L` como navegación en la barra de HardFire; para navegar existe `hardfire_open`.

Agregar `tab_id` a las herramientas existentes de navegación, entrada, captura y grabación. Cada operación resuelve una única pestaña al inicio; un cambio de selección visual mientras espera no redirige la acción.

### Esperas

`hardfire_wait_for` aceptará una condición por llamada: texto visible, CSS visible, URL que contenga un texto, estado de carga o inactividad HTTP. Timeout por defecto 10 segundos y máximo 60 segundos. Responder con la condición cumplida y tiempo transcurrido, o con `timeout` y la última observación acotada.

Para inactividad, usar una ventana configurable de calma con valor por defecto de 500 ms, excluir WebSockets y conexiones de streaming persistentes, y mantener un timeout global. Advertir en la documentación que las peticiones periódicas pueden impedir la calma y que esperar un elemento o respuesta específica suele ser mejor para juegos.

No cambiar navegación, selección de pestaña ni grabación al esperar. Cancelar al cerrar la pestaña o cuando el cliente cancele la solicitud.

### Arranque y recuperación

Mantener el arranque automático de 1.4.4 y comprobar estos estados explícitamente:

1. Puente disponible y navegador/MCP HTTP cerrado: iniciar Electron invisible y esperar disponibilidad.
2. Navegador y MCP ya disponibles: reutilizarlos, sin cambiar pestañas ni visibilidad.
3. Navegador arrancando y varias llamadas: una instancia y una espera compartida.
4. Puente stdio cerrado: el host puede volver a iniciarlo al reconectar el complemento. Un proceso cerrado no puede iniciarse a sí mismo; el host es quien lo ejecuta.
5. Navegador vivo con servidor HTTP fallido: recuperar el servidor desde la instancia existente cuando sea posible, sin cerrar sus pestañas; informar el fallo de recuperación en vez de devolver éxito.
6. Instalación ausente, endpoint remoto o autoarranque desactivado: diagnóstico claro, sin iniciar un proceso local inapropiado.

Mantener `HARDFIRE_APP_PATH`, `HARDFIRE_MCP_URL` y `HARDFIRE_AUTO_START=0`. No cambiar la configuración de otros MCP ni reiniciar Codex automáticamente.

## Límites y errores

Snapshot y búsquedas: 50 elementos por defecto, máximo 200, y presupuesto de respuesta por defecto de 12 KiB, máximo 64 KiB. Texto y atributos se recortan con indicadores explícitos. Cuando no cabe todo, devolver `truncated` y `next_cursor`; el cursor queda asociado al documento y consulta que lo generaron.

Los límites acotan también la retención de referencias y el trabajo de extracción; no basta con recortar una respuesta después de reunir un DOM ilimitado. Las imágenes siguen usando sus límites propios y no forman parte del presupuesto de texto.

Errores de herramientas distinguen `tab_not_found`, `stale_ref`, `ambiguous_match`, `not_actionable`, `unsupported_frame`, `timeout` y `backend_unavailable`. No ejecutar acciones cuando falla la validación y no ocultar errores del backend como un problema de instalación.

## Segunda entrega: depuración incremental

Consola y errores por pestaña, con cursores y retención acotada. Solicitudes HTTP resumidas con IDs estables durante la retención y `hardfire_request_get` para pedir cuerpos explícitamente. WebSockets con IDs, listado de conexiones y frames paginados. `hardfire_record_status` informa grabación, duración, peticiones, frames y bytes.

Capturar información incremental sin exigir una grabación HAR activa, pero compartir los eventos existentes para no instalar listeners competidores ni duplicar cuerpos ilimitadamente. Indicar pérdidas por límites de retención y registros expirados. Redactar secretos de cabeceras de forma consistente con el HAR; los cuerpos solo se devuelven cuando se solicitan.

La espera por una respuesta concreta se incorpora sobre esos IDs y eventos, con timeout y pestaña explícitos.

## Tercera entrega: funciones avanzadas

Hover, scroll, select, check, carga de archivos, captura de elemento, historial, viewport, simulación de red y almacenamiento. Escrituras de almacenamiento explícitas. `eval` separado de la navegación habitual, identificado como una acción que puede modificar el estado, sin usarlo automáticamente cuando falla una referencia.

Los controles de red deben definir su ámbito por pestaña o sesión y cómo se restablecen. La carga de archivos comprobará rutas reales y tipos de control, sin enviar archivos a una página como efecto secundario de inspeccionarla.

## Validación de la primera entrega

- Páginas de prueba con inputs, contenido editable, formularios dinámicos, elementos deshabilitados u ocultos, overlays, canvas y varios frames.
- Referencia correcta frente a navegación, retirada del nodo, cambio de frame y cierre de pestaña; nunca hacer clic en un nodo distinto tras invalidarla.
- Dos pestañas y cambios de selección mientras una llamada espera: la acción mantiene su pestaña de destino.
- Esperas cumplidas, timeout, conexiones persistentes y cancelación; sin esperas arbitrarias como criterio de éxito.
- Límites de elementos, bytes, referencias y paginación; cursores caducados generan errores claros.
- Pruebas reales SDK/stdio/HTTP, paridad de catálogo y regresiones del HAR y WebSockets actuales.
- Electron real en Windows: arranque desde cerrado, modo invisible, imagen, entrada, HAR y sesión conservada. Perfil de prueba aislado.
- CI existente y comprobación de arranque de Electron; no declarar soporte de frames, plataformas o casos que no se hayan verificado.

## Criterio de entrega

Primera entrega implementada, revisada, probada, empaquetada e instalada, con fuente publicada en un PR. Mantener el complemento privado y su identidad. Preservar las sesiones abiertas durante la actualización; informar cuando un proceso antiguo deba reiniciarse para cargar código nuevo.

Las entregas dos y tres continúan después de estabilizar la primera, con sus propios contratos concretos y verificaciones. Esta aprobación de diseño permite preparar el plan de implementación de la primera entrega.
