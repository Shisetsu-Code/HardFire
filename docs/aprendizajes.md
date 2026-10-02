# Aprendizajes de la integración Electron/MCP

Memoria del trabajo realizado el 2 de octubre de 2026. El historial común, decisiones y pendientes se conserva en [Resume](https://github.com/Shisetsu-Code/Resume/blob/main/knowledge/browser-mcp-lessons.md); la operación está en [la guía de Electron](electron-firetrace-chat-normal.md).

## Lo demostrado

HardFire instalado 1.5.1 funcionó desde Chat normal mediante el conector Firetrace existente. La prueba utilizó `hardfire_launch`, estado, listado de pestañas, navegación y JPEG; el backend fue `hard-browser-electron-cdp`. No se verificaron acciones dentro del juego.

El servidor remoto ya publicaba sus herramientas, pero Chat normal conservaba el catálogo anterior. Actualizar la conexión correcta permitió recibir `hardfire_*`. Instalar un plugin local, abrir un puerto o superar una prueba SDK no bastaba para demostrar acceso desde Chat normal.

## Decisiones que conviene conservar

- Separar el bridge que anuncia herramientas del navegador: descubrimiento disponible con Electron cerrado y arranque al llamar. El agente debe seguir vivo para recibir órdenes remotas.
- Conservar pestañas al alternar visible/oculto. Oculto sigue siendo Electron con renderizado, no un servidor sin escritorio.
- Identificar pestañas con `tab_id` y elementos con referencias que se invalidan al navegar. No usar IDs del navegador independiente de Firetrace.
- No repetir acciones sin resultado: consultar el comando pendiente y verificar estado. Reconexión no garantiza deduplicación después de reiniciar.
- Distinguir snapshot estructurado y JPEG. HAR de sesión y última captura de red también son objetos diferentes.
- Agrupar pasos conocidos y esperar condiciones para reducir llamadas; no se midió todavía una mejora cuantitativa.

## Publicación y pendientes

La rama pública contenía 1.4.2 al escribir esta memoria; la instalación probada era 1.5.1. Los documentos no publican el código faltante. Revisar y publicar esa implementación es un trabajo aparte. También quedan por comprobar arranque tras reinicio y captura HAR HTTP/WS desde Chat normal con una página de prueba controlada.
