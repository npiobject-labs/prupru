# anotar/ — anotaciones del cliente sobre cualquier página

Pieza **portable**: el cliente abre la app por su enlace, pulsa **Anotar**, marca lo que ve o graba un recorrido con voz, y lo envía. Vale para cualquier proyecto: se copia esta carpeta y se añade una línea a cada página.

## Qué hay aquí

| Fichero | Qué es |
|---|---|
| `anotar.js` | El botón y toda la interfaz. Sin dependencias en la página: carga las suyas desde `vendor/` cuando hacen falta. |
| `vendor/` | `snapdom` (captura del DOM), `rrweb` (grabación del recorrido), `rrweb-player` + CSS (reproducción). Todo MIT, copias locales. |
| `panel.html` | Panel del desarrollador: lista y reproduce lo recibido por el backend. Pide la clave del panel. |
| `README.md` | Esta guía. |

## Incrustarlo en otra app (parte web)

1. Copia la carpeta `anotar/` entera junto a las páginas de la app (por ejemplo en `docs/anotar/`).
2. Al final del `<body>` de cada página que el cliente pueda anotar:

   ```html
   <script src="anotar/anotar.js"></script>
   ```

   Ajusta la ruta si la página está en una subcarpeta (`../anotar/anotar.js`).
3. Opcional, atributos en esa etiqueta:

   | Atributo | Para qué | Si falta |
   |---|---|---|
   | `data-servidor="https://mi-app.fly.dev"` | Backend que recibe las anotaciones. | Se deriva de `<meta name="fly-app">`; en `localhost` usa el puerto `8080` o `?api=`. |
   | `data-proyecto="mi-app"` | Nombre del proyecto que viaja con cada anotación (útil si varios proyectos comparten backend). | El nombre de la app de Fly, o el host. |
   | `data-build="PR-B1-…"` | Versión de la página. | `<meta name="build">`. |

   Si la página no tiene backend, el botón sigue sirviendo: desaparece «Enviar al desarrollador» y quedan **Compartir** (WhatsApp, correo…) y **Descargar informe**.

Nada más: no hay que tocar el CSS ni el HTML de la app. El botón se excluye solo de las capturas y de las grabaciones.

## Incrustarlo en otra app (parte servidor, opcional)

El envío directo necesita un backend. En este proyecto es el módulo `app/src/anotaciones.rs` (Rust, axum 0.8), también portable:

1. Copia `app/src/anotaciones.rs` al otro backend, añade `mod anotaciones;` y monta sus rutas:

   ```rust
   let app = Router::new()
       // … tus rutas …
       .merge(anotaciones::rutas("nombre-del-proyecto"));
   ```

2. Dependencias en `Cargo.toml`: `axum` con la feature `multipart`, `tokio` con `fs`, `serde_json`, `reqwest` (`rustls-tls`, `json`) y `getrandom`.
3. Almacenamiento: la carpeta `DATOS` (por defecto `/datos` si existe, si no `./datos`). En Fly, un volumen montado en `/datos` (`[mounts]` en `fly.toml`); `deploy.yml` lo crea si no existe y retira la máquina anterior sin volumen.
4. Secretos opcionales de Fly (`flyctl secrets set …` o el panel web de Fly):
   - `ANOTACIONES_CLAVE`: clave del panel. Si no se define, el backend genera una la primera vez, la guarda en `/datos/clave.txt` y la imprime en el log de Fly («Clave del panel de anotaciones»).
   - `GITHUB_TOKEN` y `GITHUB_REPO` (`owner/repo`): con ellos cada anotación abre además un **issue** con la etiqueta `anotacion`, que Claude puede leer desde una sesión. Un token de grano fino con permiso de *Issues: write* sobre ese repo basta.

Las rutas: `POST /anotaciones` (multipart: `datos` JSON obligatorio; `imagen`, `audio`, `eventos`, `informe` opcionales), `GET /anotaciones?clave=…` (lista) y `GET /anotaciones/{id}/{fichero}?clave=…`. Todas con CORS abierto, porque las llaman las páginas desde otro origen. El envío es público (cualquiera con el enlace puede anotar; límite de 40 MB por envío); la lectura exige la clave.

Si se prefiere **un solo backend para todos los proyectos**, basta apuntar `data-servidor` de cada app al mismo servidor: el campo `proyecto` distingue las anotaciones en el panel y en los issues.

## Panel del desarrollador

`anotar/panel.html` lee el backend de `<meta name="fly-app">` de esa misma página, o el que se le pase una vez con `?servidor=https://otra-app.fly.dev` (queda recordado en el navegador). Pide la clave del panel, lista lo recibido y abre cada anotación: captura con marcas, nota de voz, o recorrido con la voz sincronizada, más los enlaces al informe, a los datos y al issue si lo hay.

## Qué produce cada anotación

- **Captura anotada**: `imagen.png` (captura + marcas), `datos.json` (metadatos, comentario, marcas en vectorial), `audio.*` si hay nota de voz, `informe.html` autocontenido.
- **Recorrido narrado**: `eventos.json` (rrweb), `audio.*`, `datos.json`, `informe.html` autocontenido con el reproductor dentro (se abre sin red).

`datos.json` lleva `formato: "anotacion-prupru/2"`, `tipo` (`captura` | `recorrido`), `meta` (`proyecto`, `pagina`, `titulo`, `build`, `fecha`, `ventana`, `navegador`), `nota`, `audio`, `formas` y, en recorridos, `recorrido` (`segundos`, `eventos`, `desfase_ms`).

## Límites conocidos

- La captura es del contenido de la página (no de la pantalla del sistema): iframes e imágenes de otro origen pueden salir en blanco.
- Compartir con ficheros no existe en Firefox de escritorio: ahí se descarga el informe.
- Grabaciones de voz y recorridos: 5 minutos como máximo.
