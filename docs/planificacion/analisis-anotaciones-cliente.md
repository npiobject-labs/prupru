# Análisis: botón «Anotar» para que el cliente marque y comente cualquier entregable

**Fecha:** 2026-09-27 · **Estado:** análisis y recomendación, sin desarrollo. Sustituye a `analisis-grabacion-pantalla-anotada.md`, que partía de capturar la pantalla del sistema.

## Qué se quiere

El cliente recibe un enlace a la app (hoy el mock en Pages; mañana cada entregable). Desde **cualquier dispositivo** (iOS, Android, Windows, Mac) y sin instalar nada, pulsa un botón, dibuja sobre la pantalla que está viendo (líneas, círculos, cruces, imágenes), graba una nota de voz o un recorrido narrado, y lo envía al desarrollador.

## El cambio de premisa lo simplifica todo

Lo que se anota es **la propia web**. No hace falta capturar la pantalla del sistema (imposible en móvil sin app nativa): la página puede fotografiarse a sí misma, poner un lienzo encima y grabar el micro. Todo eso lo hace un navegador moderno en las cuatro plataformas.

## Opciones

| Opción | Qué es | Pros | Contras |
|---|---|---|---|
| **1. SaaS de feedback visual** (Marker.io, Userback, BugHerd, Ruttl, Feedbucket) | Un `<script>` en la página; el cliente anota capturas y graba pantalla; llegan a un panel o a issues. | Cero desarrollo, maduro. | De pago (Marker.io desde 59 $/mes; Userback desde 10 $/usuario/mes con plan gratuito limitado; BugHerd desde 50 $/mes; Ruttl desde 12 $/usuario/mes). Marca de terceros ante el cliente. Los datos viven fuera del repo y Claude no los lee sin otro conector. |
| **2. Propio, ligero** (recomendada) | `docs/anotar.js`: una línea en cada página. Captura del DOM + lienzo + voz + recorrido, envío al backend de Fly, que abre un issue en GitHub. | Gratis, sin cuentas para el cliente, encaja con Pages + Fly + repo como fuente de verdad, Claude lo lee por la API de GitHub. | Hay que construirlo (unas dos semanas). |
| **3. Propio sin backend** (fase 1 de la 2) | Lo mismo pero al enviar genera un fichero y lo comparte con la hoja de compartir del sistema (WhatsApp, correo) o lo descarga. | Se hace en 2 o 3 días y ya vale para el mock. | Sin trazabilidad; el desarrollador recibe ficheros sueltos. |

Recomendación: **3 primero, 2 después**, con la misma interfaz de cliente. La opción 1 queda como plan B si se quiere algo mañana con presupuesto.

## Diseño de la opción propia

### Lo que ve el cliente

1. Botón flotante «Anotar» (esquina inferior, discreto) en todas las páginas de `docs/`.
2. Al pulsarlo, la página se congela en una captura y aparece encima un lienzo con: lápiz, línea, flecha, rectángulo, círculo, cruz, texto, pegatina/imagen desde galería, paleta de 6 colores, grosor, deshacer, borrar todo.
3. Bajo el lienzo: nota de texto y botón de **nota de voz** (micro).
4. Botón «Grabar recorrido»: en vez de una captura fija, graba lo que hace en la página mientras narra; al parar, revisa y envía.
5. «Enviar»: sube todo o, en la fase sin backend, abre la hoja de compartir.

### Módulos

| Módulo | Con qué | Compatibilidad |
|---|---|---|
| Captura de la vista | `snapdom` o `modern-screenshot` (foreignObject, rápidos y fieles con CSS moderno); `html2canvas` como plan B. Además se guardan URL, build del mock, tamaño de ventana y scroll para reconstruir la pantalla sobre el mismo mock versionado si la captura sale mal. | Todos. Casos difíciles: iframes, imágenes de otro origen, `backdrop-filter`. |
| Lienzo de anotación | `<canvas>` con Pointer Events (dedo, ratón, lápiz). Trazos con `perfect-freehand`; formas y pegatinas con `Fabric.js` (objetos movibles y editables) o a mano si se quiere cero dependencias. Alternativa completa: `Excalidraw` embebido (MIT; `tldraw` tiene licencia propia con marca de agua). | Todos. |
| Formato de la anotación | PNG plano (captura + trazos) para verlo rápido **y** JSON vectorial `{herramienta, color, puntos, t}` para re-renderizar o reeditar. | — |
| Nota de voz | `getUserMedia({audio})` + `MediaRecorder`. Chrome/Firefox/Android producen WebM/Opus; Safari e iOS producen MP4/AAC (y desde iOS 18.4 también WebM). | Todos desde iOS 14.3. |
| Recorrido narrado | `rrweb` graba el DOM y las interacciones como eventos (kilobytes, MIT) + pista de micro con `MediaRecorder` grabada en paralelo con la misma marca de inicio. Se reproduce en el panel con `rrweb-player` y el audio sincronizado. | Todos. No es un vídeo; si se quiere MP4 se genera en servidor con `rrvideo` (Chromium sin cabeza + ffmpeg). |
| Vídeo de pantalla real (opcional) | `getDisplayMedia` + micro → `MediaRecorder` → WebM/MP4. Se ofrece solo si el navegador lo soporta. | Escritorio (Chrome, Edge, Firefox, Safari). En móvil no, salvo iOS 27 [SUPUESTO: un informe de agosto de 2026 dice que ya funciona; verificar en un iPhone antes de contar con ello]. |
| Envío (fase 1) | Web Share API con ficheros (`navigator.share({files})`): abre WhatsApp, correo, etc. Sin soporte → descarga. | iOS 15+, Android Chrome, Safari macOS, Edge Windows. Firefox de escritorio: descarga. |
| Envío (fase 2) | `POST /anotaciones` multipart al backend de Fly con cabecera CORS, como `/hola`. | — |
| Backend (fase 2, `app/`, Rust + axum) | Guarda captura, JSON, audio y eventos en **Tigris** (S3 de Fly, bucket privado) y abre un **issue** en GitHub (`Anotación #n: <página> · <build>`) con texto, metadatos, enlaces a los ficheros y, si se activa, la **transcripción** de la voz (Whisper por API). | Token de GitHub como secreto de Fly, nunca en `docs/`. |
| Panel del desarrollador | `docs/anotaciones.html`: lista de issues con etiqueta `anotacion` (API pública de GitHub) y visor: PNG, trazos sobre el mock, audio y reproducción rrweb. Claude lee los issues desde la sesión. | — |

### Por qué issues y no ficheros en el repo

El repositorio es público: la voz del cliente y sus capturas no deben commitearse. Los binarios van a un bucket privado; en el issue va texto (metadatos, JSON de trazos, transcripción), que es lo que Claude y el desarrollador necesitan para actuar. Drive queda fuera: en este proyecto es solo destino de copias, nunca origen.

Si el repo fuera privado el problema desaparece pero `FLY_API_TOKEN` deja de llegar (plan Free); se documenta en `CLAUDE.md`.

## Planificación

| Fase | Entregable | Duración |
|---|---|---|
| 1. Botón + captura + lienzo | `docs/anotar.js` con captura, herramientas, paleta, deshacer; exporta PNG + JSON. Probado en iPhone, Android, Windows y Mac. | 2 días |
| 2. Voz y compartir | Nota de voz, nota de texto, envío por hoja de compartir o descarga. **Ya usable con el cliente sobre el mock.** | 1 día |
| 3. Recorrido narrado | rrweb + micro, revisión antes de enviar, reproducción local para probar. | 2 días |
| 4. Backend y bucket | `POST /anotaciones` en `app/`, Tigris, issue en GitHub, verificación en `deploy.yml`. | 2 o 3 días |
| 5. Panel | `docs/anotaciones.html` con visor y reproductor rrweb. | 2 días |
| 6. Extras | Transcripción de voz, vídeo de pantalla real en escritorio, MP4 desde rrweb. | 2 días, opcional |

## Riesgos

- **Fidelidad de la captura** con CSS moderno o iframes: por eso se guardan también los datos para reconstruir la pantalla sobre el mock versionado.
- **Permiso de micro en iOS**: hay que pedirlo tras un toque del usuario y en HTTPS (Pages lo es). Servido desde `localhost` también vale.
- **Tamaño de los envíos**: audio de 2 minutos ronda 1 o 2 MB; rrweb, cientos de KB. Web Share en iOS acepta ficheros de ese orden sin problema.
- **Privacidad**: el cliente debe ver un aviso de que se graba el micro; nunca grabar sin pulsar.

## Decisiones tomadas en este análisis

- Sin app nativa: todo en el navegador.
- Fase 1 y 2 sin backend, para tener algo con el cliente en tres días.
- Issues de GitHub como bandeja de entrada; binarios en bucket privado.

## Fuentes

- Soporte de captura de pantalla por navegador: https://cobaltcapture.com/reference/screen-capture-browser-support · informe de iOS 27: https://github.com/mdn/browser-compat-data/issues/30654
- MediaRecorder en Safari e iOS: https://webkit.org/blog/11353/mediarecorder-api/ · https://www.testmuai.com/learning-hub/mediarecorder-browser-support/
- rrweb: https://rrweb.com/ · rrweb con micro: https://telecom-paris.github.io/generic-rrweb-recorder/
- Comparativa de captura del DOM: https://snapdom.dev/compare/ · https://portalzine.de/best-html-to-canvas-solutions-in-2025/
- Precios SaaS: https://www.doboard.com/blog/best-marker-io-alternatives/ · https://reviseflow.io/blog/marker-alternatives
