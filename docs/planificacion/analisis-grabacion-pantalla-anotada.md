# Análisis: vídeo MP4 de la pantalla del móvil con narración y anotaciones a mano

**Fecha:** 2026-09-27 · **Estado:** análisis, sin desarrollo.

## Qué se quiere

Un vídeo `.mp4` grabado desde el móvil que contenga, sincronizados:

1. **Imagen**: lo que se ve en la pantalla del móvil en ese momento.
2. **Audio**: la voz del micrófono (narración de sugerencias o notas).
3. **Anotaciones en vivo** sobre esa pantalla, hechas con el dedo: trazos libres, líneas, círculos, cruces e imágenes (pegatinas) colocadas encima, con paleta de colores.

El resultado es un "vídeo de revisión": se enseña algo en pantalla, se señala con el dedo y se comenta por el micro.

## Lo primero: hay tres caminos, no uno

| Camino | Qué es | Anotar en vivo | Esfuerzo | Encaje con prupru |
|---|---|---|---|---|
| **A. Grabador del sistema / app de terceros** | El grabador integrado de Samsung, Xiaomi, etc., o apps tipo AZ Screen Recorder / XRecorder. Ya graban pantalla + micro a MP4 y varios traen "dibujar en pantalla" con paleta de colores. | Sí (Android). En iOS la grabación nativa lleva micro pero no permite dibujar. | Cero desarrollo | Ninguno: no hay nada que construir. Vale para probar el flujo antes de invertir. |
| **B. App nativa Android** | Servicio que captura la pantalla del sistema, mezcla el micro, muestra una capa flotante de dibujo sobre cualquier app y muxea a MP4. | Sí, sobre cualquier app | Alto (Kotlin) | Independiente del repo; puede subir el MP4 al backend de Fly. |
| **C. Web / PWA dentro de la propia app** | La página de prupru graba **su propio contenido** (no la pantalla del sistema) con el micro, y encima lleva un lienzo de anotación. | Sí, pero solo sobre lo que pinta la propia página | Medio (JS + conversión a MP4) | Total: se despliega en Pages, conversión en Fly. |

**Restricción clave del camino C** [SUPUESTO, verificar en el móvil objetivo]: los navegadores móviles (Chrome Android, Safari iOS) no exponen `getDisplayMedia`, así que desde la web **no se puede capturar la pantalla del sistema**; solo el contenido que la propia página dibuja (`canvas.captureStream()`). Plan B si el móvil sí lo soporta: usar `getDisplayMedia` directamente y el camino C cubre también otras apps.

**Restricción clave de iOS**: no existen ventanas flotantes sobre otras apps. Anotar sobre otra app en vivo es imposible; solo cabe anotar dentro de la propia app (camino C) o en postproducción sobre el vídeo ya grabado (ReplayKit + editor).

Recomendación: **empezar por A** para validar que el formato de vídeo es el que se quiere (una tarde, sin código). Si hace falta algo propio, **B** para Android es lo único que da "cualquier app + anotación en vivo"; **C** si lo que se revisa es siempre la propia app de prupru.

## Módulos que hacen falta (camino B, Android nativo)

```
┌────────────────────────────────────────────────────────────────┐
│  Servicio en primer plano (foregroundServiceType=mediaProjection)│
│                                                                  │
│  1. Captura de pantalla ── MediaProjection → VirtualDisplay ──┐  │
│  2. Micrófono ──────────── AudioRecord / MediaRecorder ───────┤  │
│  3. (opc.) audio interno ─ AudioPlaybackCapture (Android 10+) ┤  │
│                                                              ▼  │
│  4. Codificación + mux ── MediaCodec H.264 + AAC → MediaMuxer MP4│
│     (o MediaRecorder con Surface, que hace 4 de una vez)        │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│  Capa de anotación (WindowManager, TYPE_APPLICATION_OVERLAY)     │
│  5. Lienzo transparente a pantalla completa                      │
│  6. Herramientas: trazo libre, línea, círculo, cruz, flecha,     │
│     imagen/pegatina, texto; paleta de colores; grosor; deshacer; │
│     borrar todo                                                  │
│  7. Burbuja flotante: grabar/pausar/parar, modo "dibujar" vs     │
│     "tocar la app de debajo" (FLAG_NOT_TOUCHABLE alternado)      │
│  8. Registro de eventos con marca de tiempo (JSON) para poder    │
│     re-renderizar o exportar sin quemar                          │
└────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────┐
│  9. Galería / exportación: guardar en MediaStore, compartir,     │
│     subir a Fly (POST multipart) o a Drive                       │
│ 10. (opc.) Postproducción: ffmpeg (recorte, intro, overlay de    │
│     anotaciones desde el JSON, subtítulos con Whisper)           │
└────────────────────────────────────────────────────────────────┘
```

Puntos que ahorran trabajo:

- **La capa de anotación se graba sola**: `MediaProjection` captura todo lo que se ve, incluida la ventana flotante. No hace falta componer anotaciones sobre los fotogramas; basta con dibujarlas en pantalla. Si se quiere que la burbuja de controles **no** salga en el vídeo, se marca esa ventana como no capturable (`setContentSensitivity` / `FLAG_SECURE` en la burbuja, según versión).
- **`MediaRecorder` con `VirtualDisplay`** hace captura + codificación + MP4 en una sola clase; `MediaCodec` + `MediaMuxer` solo compensa si se quiere mezclar micro con audio interno o controlar el bitrate fino.
- Permisos: `RECORD_AUDIO`, `SYSTEM_ALERT_WINDOW` (el usuario lo concede en Ajustes), `FOREGROUND_SERVICE_MEDIA_PROJECTION`, `POST_NOTIFICATIONS`; la captura pide consentimiento del sistema en cada sesión de grabación (Android 14+ obliga a pedirlo cada vez).

Alternativa multiplataforma (Flutter / React Native): los plugins de grabación de pantalla existen, pero la capa flotante y el servicio siguen siendo código nativo. No ahorra lo difícil.

## Módulos que hacen falta (camino C, web en prupru)

| Módulo | Con qué | Nota |
|---|---|---|
| Lienzo de la app + lienzo de anotación superpuesto | Dos `<canvas>` apilados (o SVG encima) | Herramientas y paleta en HTML; misma UI que B. |
| Composición | Un tercer canvas fuera de pantalla que pinta app + anotaciones a 30 fps | Es lo que se graba. |
| Vídeo | `canvas.captureStream(30)` | |
| Micrófono | `getUserMedia({audio:true})` | |
| Grabación | `MediaRecorder` con las dos pistas | Chrome Android produce WebM (VP8/9 + Opus); Safari produce MP4 (H.264 + AAC). |
| Conversión a MP4 | `ffmpeg.wasm` en el navegador o `ffmpeg` en el backend de Fly (`POST /convertir`) | La conversión en Fly es más fiable en móviles modestos; el backend Rust solo lanza `ffmpeg` y devuelve el fichero. |
| Eventos de anotación | JSON con `{t, herramienta, color, puntos}` | Permite re-renderizar en otra resolución o exportar sin quemar. |

Limitación: lo que se anota es la propia página; un contenido externo (otra app, una foto) solo entra si se carga dentro de la página (imagen o vídeo subido).

## Planificación propuesta

| Fase | Entregable | Duración orientativa |
|---|---|---|
| 0. Validar con herramienta existente (camino A) | 2 o 3 vídeos de muestra con el grabador del móvil; decidir si el formato basta. | ½ día |
| 1. Decisión de camino | Android nativo (B) o web en prupru (C), según lo que se revise: cualquier app → B; solo prupru → C. | Junto con 0 |
| 2. Prototipo de grabación | Pantalla + micro → MP4 sin anotaciones. En B: servicio + `MediaRecorder`. En C: canvas + `MediaRecorder` + conversión en Fly. | 2 o 3 días |
| 3. Capa de anotación | Lienzo, trazo libre, línea, círculo, cruz, paleta de 6 colores, grosor, deshacer, borrar. Modo dibujar/tocar. | 3 o 4 días |
| 4. Imágenes y extras | Pegatinas/imágenes desde galería, flecha, texto; registro JSON de eventos. | 2 días |
| 5. Exportación | Guardar, compartir, subir a Fly/Drive. Página en Pages para ver los vídeos. | 1 o 2 días |
| 6. Postproducción (opcional) | ffmpeg: recorte, subtítulos automáticos (Whisper), quemar anotaciones desde el JSON. | 2 días |

Riesgos a vigilar: consumo de batería y calor con captura + codificación en móviles modestos (bajar a 720p/30 fps); latencia del trazo en la capa flotante (dibujar en `SurfaceView` o con hardware acceleration, no en `View` normal); en Android 14+ el consentimiento de captura se pide en cada grabación.

## Decisión pendiente del usuario

- ¿Qué se anota: **cualquier cosa** que se vea en el móvil, o **solo la app de prupru**? Esa respuesta elige entre B y C.
- ¿Android solo, o también iOS? En iOS la anotación en vivo sobre otras apps no es posible; solo sobre la propia app o en postproducción.
