# ingenieriaInversa

Prompts reconstruidos a partir del repositorio ya hecho: el enunciado que habría producido lo que hay.

| Fichero | Reconstruye | Commit de referencia |
|---|---|---|
| [`prompt-desdemovil.md`](prompt-desdemovil.md) | La plantilla entera: entorno, GitHub, Fly, Drive, PC, backend, los cuatro workflows, `docs/`, `tools/` y las reglas de cierre de sesión | `778b5d0` |

Para qué sirve esto:

- **Rehacer el proyecto desde cero** con otras decisiones, sin arrastrar las de ahora.
- **Auditar la plantilla**: lo que el prompt no menciona o no es esencial, o está sin documentar.
- **Fundar plantillas hermanas** con otro backend u otro proveedor, cambiando las secciones 3 a 6.

Estos ficheros son documentación, no fuente. Cuando el repositorio y un prompt de aquí difieran, gana el repositorio; el prompt queda obsoleto hasta que alguien lo regenere y anote el commit nuevo.

No pongas aquí claves, rutas de máquinas concretas ni datos personales: el repositorio es público. Las rutas de PC van como `%USERPROFILE%`.
