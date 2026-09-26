# Prompt de reconstrucción — plantilla DesdeMovil

Reconstruido por ingeniería inversa del repositorio `npiobject-labs/DesdeMovil` en el commit `778b5d0`.
Es el prompt que habría que dar a un agente, partiendo de un repositorio vacío, para obtener este mismo proyecto.

Las rutas de PC van como `%USERPROFILE%`: este fichero está en un repositorio público.

---

## PROMPT

Construye una plantilla de proyecto llamada **DesdeMovil** que implemente el método «PC arranca, móvil continúa»: el desarrollo, la revisión y las pruebas se hacen desde sesiones en la nube, con el PC apagado. Todo lo que sigue es el contrato del resultado. Trabaja en español, mensajes de commit en imperativo, y marca toda suposición no verificada como `[SUPUESTO]` indicando su plan B.

### 1. El entorno donde se trabaja

Da por sentado esto sobre la sesión que ejecutará el proyecto, porque condiciona casi todas las decisiones:

- El agente corre en un contenedor efímero en la nube, con el repositorio clonado en fresco. Lo que no se empuje se pierde.
- **La sesión no tiene salida a internet hacia el producto**: `curl` a `*.github.io`, a `*.fly.dev` o a un VPS devuelve `CONNECT tunnel failed, response 403`. Tampoco hay daemon de Docker ni PowerShell.
- Sí alcanza la API de GitHub. Esa es la única vía de comprobación desde la sesión.
- Consecuencia de diseño, no detalle menor: **ninguna verificación de despliegue la hace el agente**. La hacen los workflows, que corren en runners con red. Todo el proyecto se estructura alrededor de esto.
- El usuario es un desarrollador senior en solitario, trabajando a menudo desde el móvil. No expliques conceptos básicos. La fricción de arranque debe tender a cero.

### 2. GitHub: la fuente de verdad

- El repositorio, rama `main`, es la **única** fuente de verdad, tanto para el código como para la documentación de planificación. Todo lo que importe vive y se edita ahí.
- El repositorio es **público** y vive en la organización `npiobject-labs`. La visibilidad no es cosmética: de ella depende heredar el secreto de Fly (punto 3).
- El repositorio está marcado como **template**. Un proyecto nuevo nace con *Use this template*.
- **GitHub Pages siempre activo**, publicando `docs/` en cada push a `main`. Es lo único imprescindible para arrancar.
- Pages exige **un paso manual irreductible**: Settings → Pages → Source, de «Deploy from a branch» a «GitHub Actions». `enablement: true` en `configure-pages` no lo sustituye, porque `GITHUB_TOKEN` no puede crear el sitio. Documenta el síntoma de haberlo olvidado: aparecen runs `pages build and deployment` con un paso `Build with Jekyll`, el sitio sirve el README y los runs propios salen verdes sin efecto.
- Crear un proyecto nuevo son **dos pasos manuales y ninguno más**: crear el repo desde la plantilla y cambiar ese desplegable. El resto se automatiza.

### 3. Fly.io: backend opcional que no se configura

- Organización `desdemovil`, región primaria `cdg`.
- `FLY_API_TOKEN` es un **secreto de la organización** `npiobject-labs` y lo heredan sus repositorios públicos. No se crea ni se guarda un token por proyecto. Nunca se imprime en los logs.
- Por tanto el backend **no se activa**: está activo desde el primer día y basta con que exista código en `app/`. Si el repo fuera privado en plan Free, o viviera fuera de la organización, el secreto no llega.
- Sin secreto, el workflow de despliegue **termina en verde con un aviso** y no despliega nada. Fly es opcional de verdad: su ausencia nunca pone el repositorio en rojo.
- El nombre de la app se deriva como `<repo>-<owner>` en minúsculas, saneado a `[a-z0-9-]`, recortado a 30 caracteres y sin guiones finales. La variable de repositorio `FLY_APP`, si existe, manda sobre el derivado.
- El sufijo con el owner existe por una razón concreta: **el nombre de app es único en todo Fly.io**, no solo en la cuenta. Si choca, `flyctl apps create` no protesta y el fallo aparece después, en el `deploy`, con un mensaje que no apunta a la causa.
- Coste: máquinas con `auto_stop_machines`, `min_machines_running = 0`, `shared-cpu-1x` y 256 MB.

### 4. Google Drive: opcional y solo destino

- Drive es **siempre opcional** y, cuando está configurado, **solo un destino de copias**, nunca un origen.
- Se activa poniendo el id de una carpeta en la tabla de parámetros de `CLAUDE.md`. Con la fila vacía, el paso se omite sin comentarlo.
- Al cerrar sesión se suben copias de la documentación de planificación. Solo crear o sobrescribir por nombre: **nunca borrar ni renombrar nada** en Drive.
- Nunca se toma nada de Drive como origen. Si el repositorio y Drive difieren, gana el repositorio.
- Tiene que ser una carpeta normal de «Mi unidad», nunca un «Proyecto» de Drive: el conector no puede escribir en esos.
- El proyecto **no crea, mueve ni borra nada en Drive**. Solo apunta el id que le dé el usuario.

### 5. El PC local: espejo de solo lectura

- La carpeta local es un **espejo de solo lectura**. Nunca es origen de cambios y nunca se construye un camino local → nube.
- Se aterriza con un script de PowerShell idempotente que hace `fetch` + `reset --hard origin/main` + `clean -fdx`, **sobrescribiendo sin preguntar**, o clona si no existe.
- Ruta por defecto: `%USERPROFILE%\C - Desarrollo\<Proyecto>\repo`. El `repo\` es deliberado: deja sitio a un `drive\` hermano.
- La primera vez no hace falta tener nada: el script se descarga suelto con `irm` y se ejecuta, y él hace el clon.
- El PC sirve además para dos cosas que la nube no puede: **levantar la app entera en local** sin Docker, y **crear o borrar proyectos** (necesita `gh` y `flyctl` autenticados).
- Todos los scripts son de PowerShell y deben funcionar en **Windows PowerShell 5.1**: sin operadores ternarios, sin `??`, `$ErrorActionPreference = "Continue"` y comprobación de `$LASTEXITCODE` tras cada comando nativo, porque con `Stop` cualquier línea que `gh`, `git` o `flyctl` escriban en stderr se convierte en error terminal.

---

### 6. Qué construir

#### `app/` — backend en Rust

Axum 0.8 + Tokio + serde_json. Perfil release optimizado a tamaño (`opt-level = "z"`, `lto`, `codegen-units = 1`, `strip`).

| Ruta | Respuesta |
|---|---|
| `GET /` | Texto plano: `<Proyecto> backend` |
| `GET /salud` | `{"ok":true,"build":"<BUILD_ID>"}` |
| `GET /holamundo` | Texto plano: `holamundo` |

- `/salud` y `/holamundo` llevan `Access-Control-Allow-Origin: *`, porque los consume una página de Pages desde otro origen. Toda ruta nueva para el frontend lleva la misma cabecera.
- Escucha en 8080, que es lo que espera Fly. La variable `PUERTO` solo la usa el script de arranque local.
- `BUILD_ID` llega por variable de entorno; su valor es el SHA del commit desplegado. Sin ella, `dev`.
- Apagado ordenado con `ctrl_c`.
- `Dockerfile` multietapa: `rust:1-slim-bookworm` para compilar (copiando primero solo los manifiestos para cachear dependencias), `debian:bookworm-slim` para ejecutar, con usuario del sistema sin privilegios (uid 10001).
- `fly.toml` **sin clave `app`**: el nombre se pasa con `--app` desde el workflow.

#### `.github/workflows/` — cuatro workflows

**`pages.yml`** — publica `docs/` en cada push a `main` y por `workflow_dispatch`. Antes de subir el artefacto genera dos índices:

- El de la bitácora: lee todos los `*.json` de `docs/bitacora/`, valida que cada uno sea un objeto JSON con `fecha` y `titulo`, **falla el run** si alguno está mal formado, los ordena de más nuevo a más antiguo y escribe `index.json`.
- El de los mocks archivados: lee el `<title>` y el `<meta name="build">` de cada mock y genera un `index.html` con la lista.

Ninguno de los dos se commitea: van al `.gitignore`. Este workflow **no lleva el nombre del proyecto** en ninguna parte.

**`deploy.yml`** — despliega en Fly en cada push a `main` que toque `app/**` o el propio workflow, y por `workflow_dispatch`. Pasos, en orden:

1. Si no hay `FLY_API_TOKEN`, termina en verde con el aviso «Fly no configurado» y no hace nada más.
2. Determina el nombre de la app (variable `FLY_APP` o derivado) y lo imprime con su origen.
3. Crea la app si no existe, tolerando el fallo.
4. Fija `BUILD_ID` con el SHA del commit, en `--stage`.
5. Despliega con `--remote-only --ha=false`.
6. **Verifica `/salud`**: hasta 10 intentos cada 15 s; falla el run si la respuesta no contiene el SHA.
7. **Verifica `/holamundo`**: el cuerpo tiene que ser exactamente `holamundo` y la respuesta tiene que traer la cabecera CORS. Falla el run si no.
8. Escribe un resumen con app, región, URLs, la página de comprobación y el SHA.

**`init-plantilla.yml`** — inicializa un repositorio creado desde la plantilla, en el primer push. Es la pieza que hace que un proyecto nuevo no tenga nada que rellenar a mano. Dos barreras: `github.event.repository.is_template == false` **y** la existencia de un marcador `.plantilla-pendiente` en la raíz. Qué hace:

- Deriva del nombre del repositorio: el **slug** (minúsculas, saneado), el **usuario del runtime** del Dockerfile (sin guiones, sin empezar por dígito) y el **prefijo del número de build** con las iniciales (`CasaVerde` → `CV-B1`), con respaldo si salen menos de dos caracteres.
- Sustituye nombre, owner, paquete del backend (`<slug>-backend`, también en `Cargo.lock` y en la ruta del binario del Dockerfile) y prefijo de build en `CLAUDE.md`, `README.md`, `ARRANQUE.md`, `docs/*.html`, `tools/*.ps1` y `app/src/main.rs`.
- Aparta a un marcador el enlace *Use this template* antes de sustituir y lo restaura después: tiene que seguir apuntando a la plantilla original. Ojo con el `&` que a veces aparece como `&amp;`: aparta cada parámetro por separado.
- Pasa el owner por un marcador intermedio. Sustituir `npiobject-labs` y `npiobject` en cadena deja `npiobject-labs-labs` cuando el owner es la propia organización.
- Reordena `Cargo.lock` como lo haría `cargo`, para que el primer build del usuario no produzca un diff que no ha hecho él.
- Rellena la sección de parámetros de `CLAUDE.md` y **vacía el id de Drive**: no se hereda.
- Aparta la documentación heredada de `docs/planificacion/` a `docs/plantilla/`, deja la carpeta limpia y borra la entrada de ejemplo de la bitácora.
- **Comprueba por `grep` que no queda ningún rastro de la plantilla** fuera de `docs/plantilla/` y **falla el run si encuentra algo**. Ese grep es el checklist real, no una lista de ficheros para revisar a mano.
- Borra el marcador, hace commit y push, **se deshabilita a sí mismo por la API** y relanza `pages.yml` por `workflow_dispatch`.

Dos restricciones que explican su forma y que hay que documentar en el propio fichero: **no puede borrarse a sí mismo ni tocar nada bajo `.github/workflows/`** (el `GITHUB_TOKEN` no tiene ese permiso y GitHub rechazaría el push entero), y **un commit hecho con `GITHUB_TOKEN` no dispara workflows por push**, de ahí el `workflow_dispatch` explícito sobre la rama por defecto —el entorno `github-pages` solo despliega desde ella—.

**`vigilancia-fly.yml`** — red de seguridad de gasto, porque Fly no ofrece alertas. Cada lunes a las 07:00 UTC inventaría las apps de la organización, cuenta máquinas en estado `started`, escribe una tabla en el resumen y **falla el job** si superan el umbral (variable `FLY_MAQUINAS_MAX`, 0 por defecto), para que GitHub mande el correo automático a los watchers.

#### `docs/` — el sitio público

- `index.html` es el mock vivo. Los anteriores se archivan en `docs/mocks/NNN-nombre.html`. Cada mock lleva `<meta name="build" content="<PREFIJO>-AAAAMMDD-NNN">` con número nuevo en cada iteración.
- `holamundo.html` comprueba el backend desde el navegador: llama a `/holamundo` y `/salud` y muestra la respuesta y el build desplegado. Es la prueba de que frontend y backend hablan entre sí. Toma el nombre de la app de un `<meta name="fly-app">` y admite `?app=`.
- Servidas desde `localhost`, las páginas llaman al backend local en vez de al de Fly, tomando el puerto de `?api=`. En Pages no cambia nada.
- `bitacora.html` es la página pública de la bitácora: sesiones en orden inverso, con buscador, lo que se pidió con botón de copiar, qué cambió y enlaces al commit, al run, al mock archivado y al backend. Nadie la edita a mano; su índice lo genera el workflow.
- Tres guías en HTML con enfoques distintos y ninguna sustituye a las otras: un **checklist de tres pasos** pensado para tener el móvil en la mano y con el prompt listo para copiar, un **manual operativo** del recorrido entero con casillas y diagnóstico, y una **explicación del método** en prosa y tablas, con cuándo compensa y qué vale como verificación.
- `docs/` es **público**: nunca claves, endpoints internos ni datos reales.

#### `tools/` — scripts de PowerShell

| Script | Qué hace |
|---|---|
| `aterrizar.ps1` | Nube → PC. Idempotente, sobrescribe sin preguntar. Acepta `-Proyecto`, `-Owner`, `-Remote`, `-Root`, `-Rama`. |
| `estado.ps1` | «¿Estoy al día?». Solo lectura. |
| `arrancar.ps1` | Levanta la app entera en el PC: compila el backend, lo sirve en `localhost:8080` y publica `docs/` en `localhost:8081`. Necesita Rust; no necesita Docker. `-PuertoApi`, `-PuertoWeb`, `-Release`, `-SinNavegador`. |
| `eliminar.ps1` | Borra el proyecto entero desde dentro del clon aterrizado. Sin `-Confirmar` solo enseña el plan. |
| `nuevo-proyecto-V1.ps1` | Crea un proyecto: repositorio, Pages y app de Fly. Drive y carpeta local las aporta el usuario. |
| `eliminar-proyecto-V1.ps1` | Borra cualquier proyecto por nombre, sin necesidad de tener el clon delante. |

Los dos últimos concentran el trabajo y tienen contrato propio:

**Crear** — interactivo si no se le dan parámetros y desatendido con `-Si`. Enseña **el plan completo antes de tocar nada** y pide confirmación; `-Simular` enseña ese plan y termina. Es **reanudable**: si el repositorio ya existe y es del usuario, sigue desde donde se quedó en vez de fallar. Es **recuperable**: si algo falla a mitad, enumera lo que quedó a medias e imprime el comando exacto para retomarlo y el de deshacerlo, sin borrar nada por su cuenta. **Verifica de verdad** al final, por HTTP, que Pages responde y que `/salud` devuelve el SHA: aquí sí se puede, porque el PC tiene red. Reserva la app de Fly **antes** de crear el repositorio, para no dejar restos si el nombre está cogido. Sanea el nombre del proyecto (minúsculas, dígitos y guiones, 15 caracteres) confirmándolo. Guarda un registro JSON de cada proyecto creado y, con `-Init`, una ficha en texto plano donde el usuario diga —nunca dentro del clon, que el siguiente aterrizaje borraría—. No duplica la lógica de borrado: delega en el otro script.

**Borrar** — **simula por defecto**: sin `-Confirmar` no borra nada, solo enseña un inventario real de qué existe y qué no. Con `-Confirmar` pide escribir el nombre. Borra app de Fly, repositorio y clon local, y **el repositorio el último**, porque mientras existe es quien sabe cuál es la app de Fly y cuál la carpeta de Drive. El inventario sale, por ese orden, de los parámetros, del registro local y del propio repositorio. La carpeta local solo se borra si su `origin` apunta de verdad a ese repositorio. Lista de nombres protegidos, con la plantilla dentro por defecto. Sin `flyctl` aborta en vez de dejar la app viva como pendiente silencioso. Verifica al final que las tres cosas se fueron y deja anotado lo que queda a mano: la carpeta de Drive, que nunca se toca, y las sesiones de Claude.

#### Documentación y reglas

- **`CLAUDE.md`** — las reglas para los agentes, con una tabla de parámetros al principio (proyecto, owner, app de Fly, id de Drive) que rellena sola la inicialización. Contiene: la fuente de verdad, las URLs vivas, las reglas de código y de documentación, **la sección de verificación antes de avisar**, el despliegue, el aterrizaje y el cierre de sesión.
- **`ARRANQUE.md`** — el recorrido: los dos pasos manuales, qué hace la inicialización, qué pasa si a mitad del proyecto se quiere Fly, cómo activar Drive, cómo aterrizar y probar en el PC, y cómo eliminar el proyecto. Incluye los fallos esperados y por qué: **el primer run en rojo es normal**, porque *Use this template* dispara Pages antes de que se haya tocado Settings.
- **`README.md`** — el método en una docena de líneas y la tabla de las tres guías.
- La planificación y los resúmenes de sesión viven en `docs/planificacion/`, y solo ahí se editan.

#### Cierre de sesión

Cada sesión termina con dos cosas, sin excepción:

1. Un resumen de cinco líneas —qué cambió, SHA, URL para probar, resultado en Drive, qué falta— guardado en `docs/planificacion/sesiones/AAAAMMDD-HHMM.md`.
2. Una **entrada nueva** en `docs/bitacora/AAAAMMDD-HHMM.json`. Nunca se editan ni se borran entradas anteriores, ni se tocan la página ni el índice.

Los campos de la entrada: `fecha` (ISO con zona) y `titulo` obligatorios —el workflow falla si faltan—, más `objetivo`, `prompts` (array de `{texto, nota?}`), `cambios`, `sha`, `sha_completo`, `run`, `mock`, `build`, `pagina`, `fly`, `pendiente`, `enlaces` y `notas`.

Los `prompts` son **una transcripción fiel de lo que pidió el usuario, en sus términos**, no un resumen de lo que hizo el agente. Si la transcripción es aproximada, se dice en `notas`. Y como `docs/` es público: ningún prompt con claves, rutas internas, datos personales o nombres de clientes; se resume en su lugar y se anota.

### 7. Criterios de aceptación

El trabajo está hecho cuando:

1. Crear un repositorio desde la plantilla y cambiar el desplegable de Pages deja, sin tocar un solo fichero, un sitio publicado con el mock del proyecto nuevo y un backend desplegado respondiendo con el SHA de su commit.
2. El `grep` de residuos de la inicialización pasa: no queda ni un rastro del nombre de la plantilla fuera de `docs/plantilla/`.
3. Un push que rompa `/salud` o `/holamundo` **pone el run en rojo**, no en verde con una advertencia.
4. Sin `FLY_API_TOKEN`, el repositorio entero sigue en verde y el sitio estático se publica igual.
5. Una entrada de bitácora mal formada **falla la publicación** en vez de colarse en la página.
6. `aterrizar.ps1` ejecutado dos veces seguidas deja exactamente el mismo resultado.
7. Ningún script de PowerShell usa sintaxis que Windows PowerShell 5.1 no entienda.
8. Nada del repositorio afirma que algo está publicado sin haberlo confirmado contra la API de Actions.

### 8. La regla que gobierna todo lo anterior

**No anuncies «puedes probarlo» hasta confirmar por la API de GitHub Actions que el run para el SHA que acabas de enviar está en `success`.** Si en cinco minutos no lo está, avisa del fallo con la causa leída en los logs, no del éxito. Al avisar, da siempre SHA, URL y número de build.

Que un workflow termine en verde no siempre prueba lo que parece: el de Pages da por bueno el despliegue al subir el artefacto, **pero eso solo prueba que el artefacto se subió**, no que se esté sirviendo. Comprobar que el Source de Pages no ha vuelto al modo antiguo es parte de la verificación.
