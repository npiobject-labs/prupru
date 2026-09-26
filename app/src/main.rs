use axum::{http::header, response::IntoResponse, routing::get, Json, Router};
use serde_json::json;
use std::sync::OnceLock;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

// Nombre del proyecto: init-plantilla.yml lo sustituye por el del repositorio.
const NOMBRE: &str = "DesdeMovil";

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

// Fecha ISO 8601 en UTC sin dependencias: dias civiles desde 1970 (Hinnant).
fn fecha_iso(t: SystemTime) -> String {
    let s = t
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let (dias, resto) = (s.div_euclid(86_400), s.rem_euclid(86_400));
    let z = dias + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z - era * 146_097;
    let yoe = (doe - doe / 1_460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = doy - (153 * mp + 2) / 5 + 1;
    let m = if mp < 10 { mp + 3 } else { mp - 9 };
    let y = yoe + era * 400 + i64::from(m <= 2);
    format!(
        "{y:04}-{m:02}-{d:02}T{:02}:{:02}:{:02}Z",
        resto / 3_600,
        resto % 3_600 / 60,
        resto % 60
    )
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
        .route("/hola", get(hola));

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

#[cfg(test)]
mod pruebas {
    use super::fecha_iso;
    use std::time::{Duration, UNIX_EPOCH};

    fn en(s: u64) -> String {
        fecha_iso(UNIX_EPOCH + Duration::from_secs(s))
    }

    #[test]
    fn fechas_conocidas() {
        assert_eq!(en(0), "1970-01-01T00:00:00Z");
        assert_eq!(en(951_782_400), "2000-02-29T00:00:00Z");
        assert_eq!(en(1_709_251_199), "2024-02-29T23:59:59Z");
        assert_eq!(en(1_790_266_547), "2026-09-24T16:15:47Z");
        assert_eq!(en(4_102_444_800), "2100-01-01T00:00:00Z");
    }
}
