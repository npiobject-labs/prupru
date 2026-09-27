mod anotaciones;

use anotaciones::fecha_iso;
use axum::{http::header, response::IntoResponse, routing::get, Json, Router};
use serde_json::json;
use std::sync::OnceLock;
use std::time::{Instant, SystemTime};

// Nombre del proyecto: init-plantilla.yml lo sustituye por el del repositorio.
const NOMBRE: &str = "prupru";

// Momento de arranque del proceso, para /hola ("despierta desde hace...").
static ARRANQUE: OnceLock<Instant> = OnceLock::new();

// Fly siempre usa 8080; PUERTO solo lo fija tools/arrancar.ps1 al probar en el PC.
fn puerto() -> u16 {
    std::env::var("PUERTO")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(8080)
}

fn entorno(clave: &str) -> Option<String> {
    std::env::var(clave).ok().filter(|v| !v.is_empty())
}

async fn raiz() -> String {
    format!("{NOMBRE} backend")
}

// Prueba "hola mundo" consumida desde Pages (otro origen): CORS abierto.
async fn holamundo() -> impl IntoResponse {
    ([(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")], "holamundo")
}

// /salud tambien se lee desde Pages (docs/holamundo.html): misma cabecera.
async fn salud() -> impl IntoResponse {
    let build = entorno("BUILD_ID").unwrap_or_else(|| "dev".to_string());
    ([(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")], Json(json!({ "ok": true, "build": build })))
}

// El saludo de la app: la meta del instalador y el boton "Saluda" de la ficha.
// Fly inyecta FLY_APP_NAME, FLY_REGION y FLY_MACHINE_ID en cada maquina.
async fn hola() -> impl IntoResponse {
    let region = entorno("FLY_REGION");
    let desde = if region.is_some() { "Fly.io" } else { "este PC" };
    let despierta = ARRANQUE.get().map(|t| t.elapsed().as_secs()).unwrap_or(0);
    (
        [(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")],
        Json(json!({
            "app": NOMBRE,
            "mensaje": format!("Hola, soy {NOMBRE} y respondo desde {desde}"),
            "fecha": fecha_iso(SystemTime::now()),
            "servidor": desde,
            "region": region,
            "maquina": entorno("FLY_MACHINE_ID"),
            "app_fly": entorno("FLY_APP_NAME"),
            "version": entorno("BUILD_ID").unwrap_or_else(|| "dev".to_string()),
            "despierta_desde_hace_s": despierta,
        })),
    )
}

#[tokio::main]
async fn main() {
    ARRANQUE.get_or_init(Instant::now);

    let app = Router::new()
        .route("/", get(raiz))
        .route("/salud", get(salud))
        .route("/holamundo", get(holamundo))
        .route("/hola", get(hola))
        // Anotaciones del cliente (docs/anotar/): pieza portable, ver app/src/anotaciones.rs.
        .merge(anotaciones::rutas(NOMBRE));

    let direccion = format!("0.0.0.0:{}", puerto());
    let listener = tokio::net::TcpListener::bind(&direccion)
        .await
        .unwrap_or_else(|e| panic!("no se pudo abrir {direccion}: {e}"));

    println!("{NOMBRE} backend escuchando en {direccion}");

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("fallo del servidor HTTP");
}
