# Peripatéticos — análisis y propuesta de mock

**Fecha:** 2026-09-25
**Origen:** transcripción de brainstorm «Desarrollo de apps desde el móvil para usuarios no técnicos» (25-sep, 18:05).
**Alcance de esta sesión:** analizar, preguntar y hacer un mock. No se desarrolla nada.

> **Actualizado el mismo día:** tras el visto bueno se desarrolló. La sección 11 describe lo construido y **manda sobre las secciones 1–10**, que se conservan como el análisis original. Cambios de fondo: el PC comprueba el permiso de Claude (no la primera petición), los ayudantes se descargan sin `winget` y la ficha es la portada de cada app (`docs/semilla/`), no `holamundo.html`.

## 1. Qué es, en una frase

Un enlace que convierte a una persona sin ninguna formación técnica en propietaria de una app viva —web pública y servidor— que a partir de ese momento desarrolla desde el móvil, hablando con Claude Code. El PC con Windows se enciende **una vez**, y solo para hacer lo que el móvil no puede: colocar las llaves.

La meta está definida en el prompt y es verificable: la app responde «Hola, soy *Nombre* y respondo desde Fly.io», con fecha, hora y datos del servidor, desde un enlace con un botón.

## 2. La regla de oro aplicada: qué le queda al usuario

«No mandes a hacer nada que puedas hacer tú.» Repasado paso a paso, solo hay **cinco cosas** que ni un script ni un agente pueden hacer por el usuario, porque llevan su identidad o su decisión:

| Paso | Por qué es irreducible | Cómo se pide | Cómo se verifica desde el móvil |
|---|---|---|---|
| Nombre de la app | Es su decisión | Un solo campo, con vista previa de cómo quedará (web y servidor) | Formato válido y nombre libre (API pública de GitHub) |
| Cuenta de GitHub | Identidad: correo, contraseña, 2FA | Enlace directo al alta; se le pide su nombre de usuario | `api.github.com/users/<u>` es público y admite CORS: la página lo comprueba en vivo |
| Organización en GitHub | GitHub no ofrece API para crear organizaciones en el plan gratuito | Enlace directo a «New organization» y el nombre | `api.github.com/orgs/<o>`, igual que arriba |
| Cuenta de Fly.io | Identidad y, llegado el caso, tarjeta | Enlace al alta | No se puede desde el móvil sin credenciales: **se comprueba en el paso del PC** (`flyctl auth whoami`) y la página lo dice así, sin fingir |
| Claude en el móvil con GitHub conectado | OAuth con su cuenta; la app de Claude en GitHub la instala el dueño de la organización | Enlace a la app y a la pantalla de conexión | No se puede desde una página: **lo confirma la primera petición**, que deja una huella en el repositorio que la página detecta |

Todo lo demás —crear el repositorio desde el molde, renombrarlo, activar Pages, reservar la app de Fly, generar y guardar el token, lanzar el primer despliegue, comprobar que responde— lo hace el instalador del PC o un workflow. El usuario no ve ninguna clave en ningún momento.

Las dos cuentas que no se pueden verificar desde la página se marcan como **«anotado, lo compruebo más adelante»**, no como verificadas. Es la única forma honesta de cumplir «comprobaciones antes de pedir» cuando la comprobación necesita credenciales.

## 3. Formato de entrega: un enlace, no un zip

Pedías que lo planteara yo. Propuesta: **un único enlace** a una página publicada en GitHub Pages, que es a la vez la portada (para entender y decidir) y el instalador guiado (para hacerlo). Razones:

- Se abre en el móvil sin descargar nada ni buscar un fichero.
- Se puede corregir después de enviarla; un zip enviado es un zip obsoleto.
- Puede **verificar en vivo**: las tres cosas que hay que mirar (API de GitHub, la web en `github.io`, el servidor en `fly.dev`) sirven cabeceras CORS abiertas, así que la página del móvil las consulta directamente.
- Guarda el progreso en el navegador: se puede cerrar y volver.

El fichero existe, pero no es la entrada: es **un solo archivo `.cmd`** que la propia página ofrece en el paso del PC. Doble clic, dos inicios de sesión en el navegador (GitHub y Fly.io, los dos con «Autorizar»), y el PC hace el resto.

## 4. Los puntos críticos: las claves desaparecen

Identificabas como crítico establecer las API keys de GitHub, de Fly y «de la aplicación». Esta propuesta las quita del camino del usuario:

| Clave | Quién la crea | Dónde acaba | Qué ve el usuario |
|---|---|---|---|
| Token de GitHub | `gh auth login` en el PC (flujo de dispositivo: un código de 8 letras que se teclea en el navegador) | En el PC, gestionado por `gh` | Una pantalla de GitHub con «Autorizar» |
| Token de Fly.io | `flyctl auth login` (abre el navegador) y después `flyctl tokens create org` | Como secreto de **su** organización de GitHub, puesto por `gh secret set --org` | Una pantalla de Fly.io con «Autorizar». El token no se imprime nunca |
| Acceso de Claude a su GitHub | OAuth desde la app de Claude | En Claude | Dos pantallas de «Autorizar» en el móvil. Es el único punto crítico que el PC no puede absorber |
| Token de la API (`TOKEN_API`, el que en otra app se pega en «Ajustes») | Fuera de la v1. Cuando haga falta, lo genera el instalador | Secreto de Fly; al navegador llega una sola vez dentro del enlace de la ficha (`#k=…`), que la página guarda y borra de la dirección | Un enlace. Nunca una clave que copiar. Decidido el 25-sep, pregunta 5 |

Corolario: el PC no es el sitio donde se «instala la app». Es **las manos** que hacen los inicios de sesión y colocan las llaves. Por eso se enciende una vez y se puede apagar para siempre. Esta es la frase que vende el paso del PC sin asustar.

## 5. La meta: `/hola` y la ficha

El backend gana una ruta `GET /hola` que devuelve, con CORS abierto:

```json
{"app":"recetas","mensaje":"Hola, soy recetas y respondo desde Fly.io",
 "fecha":"2026-09-25T18:42:07+02:00","region":"cdg","maquina":"1781…",
 "version":"a438a95","despierta_desde_hace_s":3}
```

Fly expone `FLY_APP_NAME`, `FLY_REGION` y `FLY_MACHINE_ID` como variables de entorno: sale gratis. La **ficha** es una página pública con todos los parámetros del montaje (web, servidor, repositorio, bitácora, Drive si hay, organización, fecha de nacimiento) y el botón **Saluda**, que llama a `/hola` y enseña la respuesta en prosa. Es el enlace que el usuario comparte: «mira, mi app».

## 6. Cómo hablarle: las tres cosas

De la charla de Boris Cherny que citas: a un modelo alto solo hay que decirle **qué quieres, cuál es el guardarraíl y cuándo has terminado**. En el mock esto es una pantalla con tres campos que construyen la petición y un botón para copiarla en Claude. No es un detalle: es la forma de que un usuario no técnico pida bien desde el primer día, y la misma estructura vale para las sesiones siguientes.

## 7. Riesgos y supuestos

- **SmartScreen.** Windows avisa al abrir un `.cmd` descargado («Windows protegió tu PC»). Es el momento en que más usuarios no técnicos se echan atrás. Plan: el desplegable del paso lo explica con captura y el texto exacto de los dos toques («Más información → Ejecutar de todas formas»). Plan B: firmar el script (cuesta un certificado) o sustituir la descarga por una línea que se pega en PowerShell (más feo, sin aviso).
- **[SUPUESTO] Fly.io pide tarjeta al alta** en muchos países aunque el uso sea gratuito, y el umbral de los 25 $ cambia con el tiempo. La página no promete «gratis para siempre»: dice «gratis para empezar; Fly puede pedirte una tarjeta y avisarte antes de cobrar». Plan B: proveedor con free tier sin tarjeta, pero cambiaría el molde.
- **[SUPUESTO] Claude Code en el móvil requiere plan de pago** (Pro o superior). La página lo dice en «Qué cuesta». Plan B: enlazar a la página oficial de planes en vez de nombrar uno.
- **La organización no tiene API de creación.** Es el paso más «técnico» de los irreducibles (el usuario ve palabras como *organization*, *billing plan*). Ver pregunta 3.
- **Nombre único en todo Fly.io.** Se resuelve con el sufijo de la organización (`recetas-miorg`), y el instalador reserva la app antes de crear el repo para no dejar restos.
- **Límite de la API de GitHub sin autenticar** (60 peticiones/hora por IP). La página verifica la web y el servidor contra sus URLs directas, sin límite, y solo usa la API para usuario, organización y existencia del repositorio.
- **Ventana de espera del servidor.** El primer despliegue compila Rust (2–5 min). La página lo dice antes, con reloj, para que la espera no parezca fallo.

## 8. Qué cambia respecto al molde actual (para cuando se desarrolle)

No se ha tocado nada. Anotado para no olvidarlo:

- `deploy.yml` lleva `--org desdemovil` fijo y da por hecho que `FLY_API_TOKEN` es secreto de `npiobject-labs`. Con usuarios propios, la organización de Fly y la de GitHub son las suyas: variables `FLY_ORG` y secreto en su organización.
- `nuevo-proyecto-V1.ps1` exige `gh` y `flyctl` ya instalados y autenticados. El instalador nuevo los instala (`winget`), hace los dos inicios de sesión, crea el secreto y sigue. Reutiliza la lógica de reanudación, plan previo y verificación por HTTP, que ya funciona.
- Backend: ruta `/hola` (punto 5). `holamundo.html` pasa a ser la ficha.
- Las tres guías actuales se funden en la página única de portada + instalador. La bitácora se queda tal cual: es la memoria del proyecto del usuario.
- `init-plantilla.yml` ya renombra todo; el instalador solo espera a que termine.

## 9. Preguntas abiertas (con la opción que lleva el mock)

1. **Nombre.** La transcripción lo llama «Peripatéticos». El mock lo usa. ¿Se queda?
2. **Entrega.** Enlace único con el `.cmd` dentro (punto 3), en vez de zip. ¿De acuerdo?
3. **Organización de GitHub.** La mantienes como guardarraíl. El mock la pide con enlace directo y la verifica; el instalador deja dentro el secreto de Fly. Alternativa: admitir cuenta personal en la v1 (una pantalla menos, pero el secreto sería por repositorio y la segunda app obligaría a repetirlo).
4. **El PC.** Se enciende una vez, solo para las llaves, y se puede apagar. El aterrizaje local y el arranque en el PC quedan como extras para más adelante, fuera del camino del usuario no técnico. ¿Vale?
5. **«API key de la aplicación, del frontend».** Resuelta el 25-sep: es el token compartido web ↔ backend (`TOKEN_API`) que en otra app se pega a mano en «Ajustes». **Fuera de la v1**: `/hola` y `/salud` son lectura sin datos y lo único que expone una API abierta es despertar la máquina. Cuando la app guarde o cambie algo, el instalador genera el token, lo deja como secreto de Fly y el usuario lo recibe una sola vez dentro del enlace de la ficha; la pantalla de «Ajustes» queda como opción avanzada, no como paso. [SUPUESTO] Un solo token, todo o nada, sin usuarios ni roles; si algún día hace falta «ve pero no borra», eso es autenticación y se diseña aparte.
6. **Drive.** Fuera del camino crítico: se ofrece después de la meta, como extra. ¿O lo quieres dentro del recorrido?
7. **Fly y la tarjeta.** ¿Aceptas el texto «gratis para empezar; puede pedirte tarjeta» o prefieres exigir la tarjeta desde el principio para que no haya sorpresas a mitad?
8. **Idioma.** Solo español en la v1.

## 10. El mock

`docs/index.html`, build `DM-B3-20260925-003`; el mock 0 archivado en `docs/mocks/001-mock0.html`. Un solo fichero, sin backend, navegable por pantallas:

| Pantalla | Qué enseña |
|---|---|
| **Portada** | Qué es, para quién, por qué «peripatéticos», los tres pasos, las tres cosas que se le dicen, qué se necesita y qué cuesta |
| **Instalar** | Seis pasos con el patrón del prompt: petición no técnica → desplegable «¿Qué es esto y por qué te lo pido?» → botón **Hecho** → verificación con tres resultados (verificado, anotado para más tarde, no lo veo + qué hacer). Solo un paso activo; los demás, hechos o bloqueados. El paso del PC muestra la vigilancia en vivo y lo que se verá en la pantalla del PC |
| **Ficha** | «Tu app ha nacido»: parámetros, enlaces y el botón **Saluda** con la respuesta de `/hola` |
| **Pedir** | Los tres campos que construyen la primera petición, con ejemplos, copiar y abrir Claude |
| **Ayuda** | Qué hacer si cada paso se atasca, y cómo borrarlo todo |

Las comprobaciones están simuladas (retardo y resultado fijo); el nombre de la app rellena todos los textos y enlaces; el progreso se guarda en el navegador y hay un «Reiniciar demo». Para provocar el estado de fallo: usuario de GitHub con espacios o vacío, o nombre de app `ocupada`.

## 11. Desarrollo (25-sep, misma sesión)

Con «adelante, no me preguntes nada», las preguntas 1–4 y 6–8 se cierran con la opción que llevaba el mock; la 5 ya estaba resuelta.

### Qué hay

| Pieza | Fichero | Qué hace |
|---|---|---|
| Portada e instalador | `docs/index.html` | Los seis pasos con comprobaciones **reales**: usuario, organización y nombre libre contra la API pública de GitHub; el paso 6 vigila el repositorio, el marcador de inicialización, la web y `/hola` hasta dar la app por nacida. Demo en vivo contra el backend de la plantilla. Ficha con «Saluda» real |
| Página del PC | `docs/pc.html` | Genera `montar-<app>.cmd` en el navegador con app, organización, usuario y plantilla dentro; enseña su contenido; plan B de una línea para PowerShell; avisa si se abre en un móvil |
| Instalador | `docs/instalador/peripateticos.ps1` | Ayudantes sin admin (releases de GitHub), `gh auth login` con código de dispositivo capturado y copiado, `flyctl auth login`, token de organización de Fly como secreto de la organización de GitHub, reserva del nombre en Fly **antes** del repositorio, repo desde la plantilla, variables, Pages, espera a `init-plantilla`, despliegue, verificación HTTP, `docs/nacimiento.json`, ficha en el escritorio. Reanudable; PowerShell 5.1; solo ASCII |
| Portada del hijo | `docs/semilla/index.html` | «Hola, soy <app>» con «Saluda», dónde vive y cómo pedirle cosas. `init-plantilla.yml` la mueve a `docs/index.html` y borra lo que solo es de la plantilla |
| Backend | `app/src/main.rs` | `GET /hola`: app, mensaje, fecha ISO, región, máquina, versión, segundos despierta; CORS abierto. Test de fechas |
| Workflows | `deploy.yml`, `vigilancia-fly.yml`, `init-plantilla.yml` | Organización de Fly por variable `FLY_ORG`; `deploy.yml` verifica `/hola` y no despliega un hijo sin inicializar; `init-plantilla.yml` lanza el despliegue al terminar |
| Recorrido | `docs/recorrido.html` | Las dieciséis pantallas, sincronizadas con la salida real del instalador |

### Cómo se ha probado

- **Inicialización de un hijo**: los pasos reales de `init-plantilla.yml` ejecutados sobre una copia como `apps-de-maria/recetas`. Sin residuos; portada propia; backend `recetas-backend` compilado.
- **Instalador**: PowerShell 7.4 en el sandbox contra un GitHub y un Fly.io simulados (`gh` y `flyctl` falsos con estado), con el backend Rust **real** del hijo y su `docs/` servidos en local. Escenarios: montaje completo, nombre cogido en Fly (para sin crear nada), Fly pide tarjeta (abre la página, espera Intro, reintenta), Claude sin permiso (avisa y sigue), Pages de `init` fallido (lo relanza), usuario distinto del del móvil, organización inexistente, reanudación sobre un montaje hecho (no repite nada) y `-Simular`.
- **Extremo a extremo en Chromium** (41 comprobaciones): móvil a 390 px → pasos 1–5 con errores provocados → enlace al PC → `pc.html` en escritorio → descarga del `.cmd` → la orden de PowerShell **del propio `.cmd`** descarga el instalador de la web y lo ejecuta → el móvil lo detecta solo y llega a la meta → pasos 4 y 5 pasan a verificado con `nacimiento.json` → ficha y «Saluda» contra el backend real → portada del hijo. Sin errores de JS y sin scroll horizontal en ninguna pantalla.
- `deploy.yml`: el script de verificación de `/hola` probado contra el backend local (pasa con el SHA correcto, falla con otro).

### Supuestos pendientes de un Windows real

- **[SUPUESTO]** `gh auth login --web` con la salida redirigida no espera a Intro ni abre el navegador (lo hace el instalador) e imprime el código por stderr. Plan B: si una versión de `gh` cambia el formato, el instalador sigue enseñando las líneas de `gh` al fallar; se ajusta la expresión del código.
- **[SUPUESTO]** Un token `flyctl tokens create org` basta para `apps create`, `secrets set` y `deploy --remote-only`. Plan B: token de despliegue por app (`tokens create deploy -a <app>`) creado tras reservarla.
- **[SUPUESTO]** `flyctl orgs list --json` devuelve un mapa `slug → nombre` (se aceptan también listas con `slug`).
- **[SUPUESTO]** La app de GitHub de Claude se llama `claude` en `orgs/<org>/installations`. Plan B: si no, el aviso sale aunque tenga permiso; no bloquea nada.
- **[SUPUESTO]** En organizaciones Free, los secretos de organización llegan a los repositorios públicos (así funciona hoy la plantilla en `npiobject-labs`).
- Nada de esto se ha ejecutado en Windows PowerShell 5.1: solo en PowerShell 7 y con sintaxis compatible con 5.1 revisada. **La primera ejecución real conviene hacerla con una organización de prueba.**

## 12. Drive y la copia en el PC (25-sep, misma sesión)

Tres cambios pedidos tras la primera entrega, que reabren las preguntas 4 y 6:

- **Drive entra en el recorrido** (pregunta 6). Paso 6, opcional: el usuario crea a mano una carpeta con el nombre de la app en «Mi unidad» y pega su enlace; la página saca el id (de al menos 25 caracteres: los reales miden unos 33), rechaza enlaces a archivos y textos que no son un id, y ofrece «Sin Drive». El id viaja al PC (`&drive=` → `PERI_DRIVE` en el `.cmd`) y el instalador lo escribe en la fila **Carpeta de Drive (id)** de `CLAUDE.md` del hijo. `docs/nacimiento.json` solo dice `drive: true`: el id no va a `docs/`, que es público.
- **Claude comprueba que llega a Drive** (paso 8). Ni la página ni el PC pueden entrar en la carpeta: solo una sesión de Claude con el conector de Google Drive. La página da la petición lista para copiar; Claude sigue la sección **Comprobación de Drive** de `CLAUDE.md` (lista la carpeta, sube `Ficha de <app>.md`, escribe `docs/drive.json` con `verificado`, `fecha` y `fichero`, o `verificado: false` y el motivo) y la página vigila ese fichero en Pages. Si Claude no llega, la página dice cómo conectar Drive en **Ajustes → Conectores**. Con Drive, la meta espera a este paso; sin Drive se omite. De paso queda probado que Claude escribe en el repositorio.
- **Copia de seguridad en el PC** (pregunta 4). Paso 7/7 del instalador: `Documentos\Peripateticos\<app>\` con `repo\` (zip de `main`, sin git), la ficha, `LEEME.txt`, accesos directos (web, servidor, bitácora, código, Claude, Drive), `Actualizar copia.cmd` (autosuficiente: vuelve a bajar el zip y sustituye `repo\` entero) y un acceso a la carpeta en el escritorio. Espejo de solo lectura, como manda `CLAUDE.md`.
- La portada explica los tres destinos en «Dónde queda todo», y Drive aparece en «Tres pasos», «Qué necesitas» y «Qué cuesta».

Pruebas: 64 comprobaciones de extremo a extremo en Chromium (enlace de archivo y texto no válido rechazados, id de Drive por enlace → `.cmd` → `CLAUDE.md` del hijo, `drive.json` falso y luego verdadero, camino «Sin Drive», copia en el PC con su contenido) y `Actualizar copia.cmd` ejecutado de verdad sobre la copia: sustituye `repo\` y se lleva un cambio hecho a mano. Las pruebas del instalador destaparon dos fallos, arreglados: aceptaba como id de Drive cualquier texto de 15 caracteres, y el aviso de enlace no válido no salía porque a nivel de script `$script:Drive` y el parámetro `$Drive` son la misma variable.

- **[SUPUESTO]** El conector de Google Drive de Claude puede escribir en una carpeta normal de «Mi unidad» creada a mano por el usuario (así funciona hoy en este proyecto). Plan B: si en alguna cuenta solo ve lo que crea el propio conector, que Claude cree la carpeta y el usuario pegue después su enlace.
- **[SUPUESTO]** `[Environment]::GetFolderPath("MyDocuments")` devuelve la carpeta de Documentos aunque esté redirigida a OneDrive. Plan B: `-Local` o `PERI_LOCAL` para otra ruta.

## 13. Varias apps con las mismas cuentas (25-sep, misma sesión)

Pregunta del usuario: ¿los pasos 2 a 5 se repiten para cada app? Análisis:

| Paso | ¿Reutilizable? | Por qué |
|---|---|---|
| 2 · Cuenta de GitHub | Sí | Es la identidad del usuario. |
| 3 · Organización | Sí | Además conviene: `FLY_API_TOKEN` y `FLY_ORG` viven a nivel de organización y cada app nueva los hereda. Solo hay que comprobar que el nombre nuevo está libre en ella. |
| 4 · Fly.io | Sí | Misma cuenta y organización de Fly. |
| 5 · Claude | Sí, con matiz | Si la app de GitHub de Claude tiene permiso solo en «los repositorios elegidos», no ve el repositorio nuevo. |
| 1 · Nombre, 6 · Drive | No | Son de cada app. |
| 7 · PC | Hay que volver a abrirlo | Crea el repositorio, pero ya sin inicios de sesión: ayudantes y sesiones de `gh` y `flyctl` siguen en el PC. |

Implementado:

- **Guía** (`docs/index.html`, build `DM-B3-20260925-010`): al llegar a la meta guarda en el navegador el perfil (usuario, organización y qué quedó verificado de Fly y Claude; nunca llaves) y la lista de apps. La portada enseña «Tus apps» con «Montar otra app»: los pasos 2 a 5 salen como «guardado», usuario y organización se revalidan contra la API, y el paso 1 comprueba ya que el nombre está libre en la organización. «Copiar enlace con mis cuentas» (`?u=…&org=…`) lleva el perfil a otro navegador y la dirección se limpia al cargar; «Olvidar mis datos» lo borra. «Empezar de nuevo» conserva el perfil.
- **Instalador**: mira el `repository_selection` de la instalación de Claude en la organización; si es `selected`, añade el repositorio nuevo (`PUT user/installations/<id>/repositories/<repo_id>`) o, si no puede, avisa con el enlace a «Repository access» de esa instalación.
- **Recorrido**: pantalla 20, «Otra app».

Pruebas: 73 comprobaciones de extremo a extremo en Chromium (portada con «Tus apps», pasos 2 a 5 guardados, nombre libre en el paso 1, enlace al PC con las cuentas guardadas, enlace con cuentas en otro navegador, «Olvidar mis datos»); instalador en la segunda app sin inicios de sesión, con Claude en «repositorios elegidos» añadiendo el repositorio y, en el caso de fallo, avisando con el enlace.

- **[SUPUESTO]** El token OAuth de `gh` (con `repo`) basta para añadir un repositorio a la instalación de Claude. Plan B: el aviso con el enlace directo a «Repository access», ya implementado.
- Siguiente paso posible, no hecho: montar la segunda app **sin PC**. La llave de Fly ya está en la organización; faltaría crear el repositorio desde la plantilla y activar Pages, que hoy exigen una credencial con permisos de administración que solo tiene el PC. Hacerlo desde el móvil pediría al usuario dos pasos a mano en GitHub, contra la regla de oro.
