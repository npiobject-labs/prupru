//! Anotaciones del cliente: las envía docs/anotar/anotar.js y las lee docs/anotar/panel.html.
//!
//! Pieza portable: copia este fichero a cualquier backend axum 0.8, añade `mod anotaciones;`
//! y monta `.merge(anotaciones::rutas("nombre-del-proyecto"))`. Dependencias en Cargo.toml:
//! axum (feature "multipart"), tokio (feature "fs"), serde_json, reqwest (rustls-tls, json), getrandom.
//!
//! Rutas: POST /anotaciones (multipart: datos, imagen, audio, eventos, informe),
//!        GET /anotaciones?clave=… y GET /anotaciones/{id}/{fichero}?clave=… (lectura protegida).
//! Entorno: DATOS (carpeta; en Fly, el volumen /datos), ANOTACIONES_CLAVE (clave del panel; si no,
//!          se genera y se guarda en la carpeta), GITHUB_TOKEN + GITHUB_REPO (opcionales: abren un issue).

use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, Query, Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

// Repositorio por defecto para los issues (GITHUB_REPO lo cambia).
const REPO: &str = "npiobject-labs/prupru";
// Tamaño máximo de una anotación completa (captura, voz, recorrido e informe).
const LIMITE_CUERPO: usize = 40 * 1024 * 1024;

fn entorno(clave: &str) -> Option<String> {
    std::env::var(clave).ok().filter(|v| !v.is_empty())
}

fn puerto() -> u16 {
    std::env::var("PUERTO").ok().and_then(|p| p.parse().ok()).unwrap_or(8080)
}

// Fecha ISO 8601 en UTC sin dependencias: dias civiles desde 1970 (Hinnant).
pub fn fecha_iso(t: SystemTime) -> String {
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

struct Estado {
    nombre: String,
    datos: PathBuf,
    clave: String,
    cliente: reqwest::Client,
}

// Carpeta de datos: DATOS si se define; el volumen /datos en Fly; ./datos en el PC.
fn carpeta_datos() -> PathBuf {
    if let Some(d) = entorno("DATOS") {
        return PathBuf::from(d);
    }
    if std::path::Path::new("/datos").is_dir() {
        return PathBuf::from("/datos");
    }
    PathBuf::from("./datos")
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn azar(n: usize) -> Vec<u8> {
    let mut b = vec![0u8; n];
    if getrandom::fill(&mut b).is_err() {
        // Sin fuente de azar (raro): mezcla del reloj, suficiente para un sufijo.
        let t = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_nanos()).unwrap_or(0);
        for (i, x) in b.iter_mut().enumerate() {
            *x = ((t >> (8 * (i % 16))) & 0xff) as u8;
        }
    }
    b
}

// La clave que protege la lectura del panel: ANOTACIONES_CLAVE, o una generada
// la primera vez y guardada en la carpeta de datos (se imprime en el log una vez).
fn clave_panel(datos: &std::path::Path) -> String {
    if let Some(c) = entorno("ANOTACIONES_CLAVE") {
        return c;
    }
    let fichero = datos.join("clave.txt");
    if let Ok(c) = std::fs::read_to_string(&fichero) {
        let c = c.trim().to_string();
        if !c.is_empty() {
            return c;
        }
    }
    let c = hex(&azar(12));
    if let Err(e) = std::fs::write(&fichero, &c) {
        eprintln!("no se pudo guardar la clave en {}: {e}", fichero.display());
    }
    println!("Clave del panel de anotaciones (nueva, guardada en {}): {c}", fichero.display());
    c
}

// Id legible y ordenable: fecha UTC + sufijo al azar.
fn nuevo_id() -> String {
    let f = fecha_iso(SystemTime::now());
    let compacta: String = f.chars().filter(|c| c.is_ascii_digit()).collect();
    format!("{}-{}-{}", &compacta[..8], &compacta[8..14], hex(&azar(2)))
}

fn id_valido(id: &str) -> bool {
    !id.is_empty() && id.len() <= 40 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
}

// Ficheros que puede tener una anotación y su tipo al servirlos.
fn tipo_de(nombre: &str) -> Option<&'static str> {
    Some(match nombre {
        "datos.json" | "eventos.json" | "issue.json" => "application/json; charset=utf-8",
        "imagen.png" => "image/png",
        "informe.html" => "text/html; charset=utf-8",
        "audio.webm" => "audio/webm",
        "audio.m4a" | "audio.mp4" => "audio/mp4",
        "audio.ogg" => "audio/ogg",
        _ => return None,
    })
}

fn extension_audio(fichero: Option<&str>, tipo: Option<&str>) -> &'static str {
    let f = fichero.unwrap_or("").to_ascii_lowercase();
    let t = tipo.unwrap_or("").to_ascii_lowercase();
    if f.ends_with(".m4a") || f.ends_with(".mp4") || t.contains("mp4") || t.contains("aac") {
        "m4a"
    } else if f.ends_with(".ogg") || t.contains("ogg") {
        "ogg"
    } else {
        "webm"
    }
}

fn error(estado: StatusCode, texto: &str) -> Response {
    (estado, Json(json!({ "ok": false, "error": texto }))).into_response()
}

fn autorizado(e: &Estado, cabeceras: &HeaderMap, consulta: &HashMap<String, String>) -> bool {
    let dada = cabeceras
        .get("x-clave")
        .and_then(|v| v.to_str().ok())
        .map(str::to_string)
        .or_else(|| consulta.get("clave").cloned())
        .unwrap_or_default();
    !dada.is_empty() && dada == e.clave
}

// POST /anotaciones: multipart con `datos` (JSON) y, opcionales, `imagen` (PNG),
// `audio`, `eventos` (JSON de rrweb) e `informe` (HTML autocontenido).
async fn crear_anotacion(State(e): State<Arc<Estado>>, mut mp: Multipart) -> Response {
    let id = nuevo_id();
    let dir = e.datos.join("anotaciones").join(&id);
    if let Err(err) = tokio::fs::create_dir_all(&dir).await {
        eprintln!("no se pudo crear {}: {err}", dir.display());
        return error(StatusCode::INTERNAL_SERVER_ERROR, "no se pudo guardar");
    }
    let mut datos: Option<Value> = None;
    let mut ficheros: Vec<String> = Vec::new();
    loop {
        let campo = match mp.next_field().await {
            Ok(Some(c)) => c,
            Ok(None) => break,
            Err(_) => return error(StatusCode::BAD_REQUEST, "cuerpo multipart inválido"),
        };
        let nombre = campo.name().unwrap_or("").to_string();
        let fichero = campo.file_name().map(str::to_string);
        let tipo = campo.content_type().map(str::to_string);
        let bytes = match campo.bytes().await {
            Ok(b) => b,
            Err(_) => return error(StatusCode::BAD_REQUEST, "no se pudo leer un campo"),
        };
        let destino = match nombre.as_str() {
            "datos" => {
                match serde_json::from_slice::<Value>(&bytes) {
                    Ok(v) if v.is_object() => datos = Some(v),
                    _ => return error(StatusCode::BAD_REQUEST, "el campo datos no es un objeto JSON"),
                }
                continue;
            }
            "imagen" => "imagen.png".to_string(),
            "audio" => format!("audio.{}", extension_audio(fichero.as_deref(), tipo.as_deref())),
            "eventos" => "eventos.json".to_string(),
            "informe" => "informe.html".to_string(),
            _ => continue,
        };
        if bytes.is_empty() {
            continue;
        }
        if let Err(err) = tokio::fs::write(dir.join(&destino), &bytes).await {
            eprintln!("no se pudo escribir {destino} en {}: {err}", dir.display());
            return error(StatusCode::INTERNAL_SERVER_ERROR, "no se pudo guardar");
        }
        ficheros.push(destino);
    }
    let Some(mut datos) = datos else {
        let _ = tokio::fs::remove_dir_all(&dir).await;
        return error(StatusCode::BAD_REQUEST, "falta el campo datos");
    };
    datos["id"] = json!(id);
    datos["recibido"] = json!(fecha_iso(SystemTime::now()));
    datos["ficheros"] = json!(ficheros);
    let issue = crear_issue(&e, &id, &datos).await;
    if let Some(url) = &issue {
        datos["issue"] = json!(url);
        let _ = tokio::fs::write(dir.join("issue.json"), json!({ "url": url }).to_string()).await;
    }
    if let Err(err) = tokio::fs::write(dir.join("datos.json"), datos.to_string()).await {
        eprintln!("no se pudo escribir datos.json en {}: {err}", dir.display());
        return error(StatusCode::INTERNAL_SERVER_ERROR, "no se pudo guardar");
    }
    println!("anotación {id} guardada ({} ficheros){}", ficheros.len(), issue.as_deref().map(|u| format!(", issue {u}")).unwrap_or_default());
    (StatusCode::CREATED, Json(json!({ "ok": true, "id": id, "ficheros": ficheros, "issue": issue }))).into_response()
}

fn texto(v: &Value, clave: &str) -> String {
    v.get(clave).and_then(Value::as_str).unwrap_or("").to_string()
}

// Resumen de una anotación para la lista del panel y para el issue.
fn resumen(d: &Value) -> Value {
    let meta = d.get("meta").cloned().unwrap_or_else(|| json!({}));
    let formas = d.get("formas").and_then(Value::as_array).map(Vec::len).unwrap_or(0);
    let voz = d.get("audio").and_then(|a| a.get("segundos")).and_then(Value::as_u64);
    let recorrido = d.get("recorrido").and_then(|r| r.get("segundos")).and_then(Value::as_u64);
    json!({
        "id": texto(d, "id"),
        "proyecto": texto(&meta, "proyecto"),
        "recibido": texto(d, "recibido"),
        "tipo": texto(d, "tipo"),
        "titulo": texto(&meta, "titulo"),
        "pagina": texto(&meta, "pagina"),
        "build": texto(&meta, "build"),
        "fecha": texto(&meta, "fecha"),
        "nota": texto(d, "nota"),
        "marcas": formas,
        "voz_s": voz,
        "recorrido_s": recorrido,
        "ficheros": d.get("ficheros").cloned().unwrap_or_else(|| json!([])),
        "issue": d.get("issue").cloned().unwrap_or(Value::Null),
    })
}

// Si hay GITHUB_TOKEN (secreto de Fly), cada anotación abre un issue en el repo.
async fn crear_issue(e: &Estado, id: &str, d: &Value) -> Option<String> {
    let token = entorno("GITHUB_TOKEN")?;
    let repo = entorno("GITHUB_REPO").unwrap_or_else(|| REPO.to_string());
    let r = resumen(d);
    let app = entorno("FLY_APP_NAME").unwrap_or_else(|| "localhost".to_string());
    let base = if app == "localhost" { format!("http://localhost:{}", puerto()) } else { format!("https://{app}.fly.dev") };
    let (owner, nombre) = repo.split_once('/').unwrap_or(("", &repo));
    let panel = format!("https://{owner}.github.io/{nombre}/anotaciones.html#{id}");
    let tipo = if texto(&r, "tipo") == "recorrido" { "recorrido narrado" } else { "captura anotada" };
    let proyecto = d.get("meta").map(|m| texto(m, "proyecto")).filter(|p| !p.is_empty()).unwrap_or_else(|| e.nombre.clone());
    let ficheros = r["ficheros"].as_array().map(|f| f.iter().filter_map(Value::as_str).map(|n| format!("- [{n}]({base}/anotaciones/{id}/{n})")).collect::<Vec<_>>().join("\n")).unwrap_or_default();
    let mut formas = d.get("formas").cloned().unwrap_or(Value::Null).to_string();
    if formas.len() > 20_000 {
        formas.truncate(20_000);
        formas.push_str("… (recortado)");
    }
    let cuerpo = format!(
        "**Anotación del cliente** ({tipo}) sobre **{proyecto}**, recibida el {recibido}.\n\n\
         | | |\n|---|---|\n| Página | {pagina} |\n| Build | `{build}` |\n| Fecha del cliente | {fecha} |\n| Marcas | {marcas} |\n| Voz | {voz} |\n| Recorrido | {rec} |\n\n\
         **Comentario:**\n\n{nota}\n\n\
         **Ficheros** (añade `?clave=<clave del panel>` a cada enlace, o ábrelos desde el [panel]({panel})):\n{ficheros}\n\n\
         <details><summary>Marcas (JSON)</summary>\n\n```json\n{formas}\n```\n</details>\n",
        recibido = texto(&r, "recibido"),
        pagina = texto(&r, "pagina"),
        build = texto(&r, "build"),
        fecha = texto(&r, "fecha"),
        marcas = r["marcas"],
        voz = r["voz_s"].as_u64().map(|s| format!("{s} s")).unwrap_or_else(|| "no".into()),
        rec = r["recorrido_s"].as_u64().map(|s| format!("{s} s")).unwrap_or_else(|| "no".into()),
        nota = if texto(&r, "nota").is_empty() { "_(sin comentario escrito)_".to_string() } else { texto(&r, "nota") },
    );
    let titulo = format!("Anotación {id} · {} · {}", texto(&r, "titulo"), texto(&r, "build"));
    let respuesta = e
        .cliente
        .post(format!("https://api.github.com/repos/{repo}/issues"))
        .bearer_auth(token)
        .header(header::USER_AGENT, format!("{}-backend", e.nombre))
        .header(header::ACCEPT, "application/vnd.github+json")
        .json(&json!({ "title": titulo, "body": cuerpo, "labels": ["anotacion"] }))
        .send()
        .await;
    match respuesta {
        Ok(resp) if resp.status().is_success() => resp.json::<Value>().await.ok()?.get("html_url")?.as_str().map(str::to_string),
        Ok(resp) => {
            eprintln!("GitHub no aceptó el issue de {id}: {}", resp.status());
            None
        }
        Err(err) => {
            eprintln!("no se pudo llamar a GitHub para {id}: {err}");
            None
        }
    }
}

// GET /anotaciones?clave=…: lista de anotaciones, la más reciente primero.
async fn listar_anotaciones(State(e): State<Arc<Estado>>, cabeceras: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    if !autorizado(&e, &cabeceras, &q) {
        return error(StatusCode::UNAUTHORIZED, "clave del panel incorrecta o ausente");
    }
    let dir = e.datos.join("anotaciones");
    let mut lista = Vec::new();
    if let Ok(mut entradas) = tokio::fs::read_dir(&dir).await {
        while let Ok(Some(en)) = entradas.next_entry().await {
            if let Ok(t) = tokio::fs::read_to_string(en.path().join("datos.json")).await {
                if let Ok(d) = serde_json::from_str::<Value>(&t) {
                    lista.push(resumen(&d));
                }
            }
        }
    }
    lista.sort_by(|a, b| texto(b, "id").cmp(&texto(a, "id")));
    Json(json!({ "ok": true, "total": lista.len(), "anotaciones": lista })).into_response()
}

// GET /anotaciones/{id}/{fichero}?clave=…: un fichero de una anotación.
async fn fichero_anotacion(State(e): State<Arc<Estado>>, Path((id, nombre)): Path<(String, String)>, cabeceras: HeaderMap, Query(q): Query<HashMap<String, String>>) -> Response {
    if !autorizado(&e, &cabeceras, &q) {
        return error(StatusCode::UNAUTHORIZED, "clave del panel incorrecta o ausente");
    }
    if !id_valido(&id) {
        return error(StatusCode::BAD_REQUEST, "id inválido");
    }
    let Some(tipo) = tipo_de(&nombre) else {
        return error(StatusCode::NOT_FOUND, "fichero desconocido");
    };
    match tokio::fs::read(e.datos.join("anotaciones").join(&id).join(&nombre)).await {
        Ok(bytes) => (
            [(header::CONTENT_TYPE, HeaderValue::from_static(tipo)), (header::CACHE_CONTROL, HeaderValue::from_static("private, max-age=60"))],
            Body::from(bytes),
        )
            .into_response(),
        Err(_) => error(StatusCode::NOT_FOUND, "no existe"),
    }
}

fn cabeceras_cors(h: &mut HeaderMap) {
    h.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, HeaderValue::from_static("*"));
    h.insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static("GET, POST, OPTIONS"));
    h.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static("Content-Type, X-Clave"));
    h.insert(header::ACCESS_CONTROL_MAX_AGE, HeaderValue::from_static("86400"));
}

// Las anotaciones se envían y se leen desde Pages (otro origen): CORS en todas
// las respuestas de /anotaciones y respuesta directa al preflight OPTIONS.
async fn cors(req: Request, next: Next) -> Response {
    if req.method() == Method::OPTIONS {
        let mut r = StatusCode::NO_CONTENT.into_response();
        cabeceras_cors(r.headers_mut());
        return r;
    }
    let mut r = next.run(req).await;
    cabeceras_cors(r.headers_mut());
    r
}


/// Router con las rutas de anotaciones, listo para `.merge()` en la app principal.
pub fn rutas(nombre: &str) -> Router {
    let datos = carpeta_datos();
    if let Err(e) = std::fs::create_dir_all(datos.join("anotaciones")) {
        eprintln!("no se pudo preparar la carpeta de datos {}: {e}", datos.display());
    }
    let estado = Arc::new(Estado {
        nombre: nombre.to_string(),
        clave: clave_panel(&datos),
        datos,
        cliente: reqwest::Client::builder().timeout(std::time::Duration::from_secs(20)).build().expect("cliente HTTP"),
    });
    Router::new()
        .route("/anotaciones", get(listar_anotaciones).post(crear_anotacion))
        .route("/anotaciones/{id}/{fichero}", get(fichero_anotacion))
        .layer(middleware::from_fn(cors))
        .layer(DefaultBodyLimit::max(LIMITE_CUERPO))
        .with_state(estado)
}

#[cfg(test)]
mod pruebas {
    use super::{extension_audio, fecha_iso, id_valido, nuevo_id, tipo_de};
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

    #[test]
    fn ids() {
        let id = nuevo_id();
        assert_eq!(id.len(), 8 + 1 + 6 + 1 + 4, "{id}");
        assert!(id_valido(&id));
        assert!(!id_valido("../otro"));
        assert!(!id_valido(""));
    }

    #[test]
    fn ficheros_permitidos() {
        assert!(tipo_de("imagen.png").is_some());
        assert!(tipo_de("audio.m4a").is_some());
        assert!(tipo_de("../clave.txt").is_none());
        assert_eq!(extension_audio(Some("voz.m4a"), None), "m4a");
        assert_eq!(extension_audio(None, Some("audio/webm;codecs=opus")), "webm");
        assert_eq!(extension_audio(None, Some("audio/mp4")), "m4a");
    }
}
