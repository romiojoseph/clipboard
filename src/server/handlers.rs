use crate::sensitive;
use crate::store::db::DB;
use axum::{
    body::Body,
    extract::{Extension, Path, Query},
    http::StatusCode,
    response::{IntoResponse, Json, Response},
};
use rust_embed::RustEmbed;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};

#[derive(RustEmbed)]
#[folder = "web/dist"]
struct Asset;

pub async fn static_handler(uri: axum::http::Uri) -> impl IntoResponse {
    let path = uri.path().trim_start_matches('/');
    // Normalize to forward slashes — rust_embed on Windows may store with backslashes
    let path = if path.is_empty() { "index.html".to_string() } else { path.replace('\\', "/") };
    let path = path.as_str();
    if let Some(content) = Asset::get(path) {
        let mime = if path.ends_with(".js") || path.ends_with(".mjs") {
            "application/javascript; charset=utf-8".to_string()
        } else if path.ends_with(".css") {
            "text/css; charset=utf-8".to_string()
        } else if path.ends_with(".html") {
            "text/html; charset=utf-8".to_string()
        } else if path.ends_with(".svg") {
            "image/svg+xml".to_string()
        } else if path.ends_with(".png") {
            "image/png".to_string()
        } else if path.ends_with(".ico") {
            "image/x-icon".to_string()
        } else if path.ends_with(".json") {
            "application/json".to_string()
        } else if path.ends_with(".wasm") {
            "application/wasm".to_string()
        } else {
            mime_guess::from_path(path)
                .first_or_octet_stream()
                .to_string()
        };
        Response::builder()
            .status(StatusCode::OK)
            .header(axum::http::header::CONTENT_TYPE, mime)
            .body(Body::from(content.data.into_owned()))
            .unwrap()
    } else if let Some(index) = Asset::get("index.html") {
        // SPA fallback — only for paths that look like routes (no extension)
        // Never serve index.html for asset requests that 404
        if path.contains('.') {
            return Response::builder()
                .status(StatusCode::NOT_FOUND)
                .body(Body::from("Not found"))
                .unwrap();
        }
        Response::builder()
            .status(StatusCode::OK)
            .header(axum::http::header::CONTENT_TYPE, "text/html; charset=utf-8")
            .body(Body::from(index.data.into_owned()))
            .unwrap()
    } else {
        Response::builder()
            .status(StatusCode::NOT_FOUND)
            .body(Body::from("Not found"))
            .unwrap()
    }
}

// ---------- clips ----------
pub async fn handle_clips_get(
    Extension(db): Extension<Arc<Mutex<DB>>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    let query = params.get("q").map(String::as_str).unwrap_or("");
    match db.get_clips(query) {
        Ok(clips) => Json(clips).into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
pub struct CreateClipPayload {
    content: String,
}

pub async fn handle_clips_post(
    Extension(db): Extension<Arc<Mutex<DB>>>,
    Json(payload): Json<CreateClipPayload>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    match db.save_clip(&payload.content) {
        Ok(_) => StatusCode::CREATED.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn handle_clips_clear(
    Extension(db): Extension<Arc<Mutex<DB>>>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    match db.clear_unpinned_clips() {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

pub async fn handle_clip_delete(
    Extension(db): Extension<Arc<Mutex<DB>>>,
    Path(id): Path<i64>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    match db.delete_clip(id) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            (StatusCode::NOT_FOUND, "clip not found").into_response()
        }
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

#[derive(Deserialize)]
pub struct PatchClipPayload {
    pinned: Option<bool>,
    tags: Option<String>,
    content: Option<String>,
}

pub async fn handle_clip_patch(
    Extension(db): Extension<Arc<Mutex<DB>>>,
    Path(id): Path<i64>,
    Json(payload): Json<PatchClipPayload>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    if let Some(pinned) = payload.pinned {
        if let Err(e) = db.toggle_pin(id, pinned) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response();
        }
    }
    if let Some(tags) = payload.tags {
        if let Err(e) = db.update_clip_tags(id, &tags) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response();
        }
    }
    if let Some(content) = payload.content {
        if let Err(e) = db.update_clip_content(id, &content) {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response();
        }
    }
    StatusCode::NO_CONTENT.into_response()
}

// ---------- settings ----------
pub async fn handle_settings_get(
    Extension(db): Extension<Arc<Mutex<DB>>>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    let recording = db
        .get_setting("recording")
        .ok()
        .flatten()
        .unwrap_or_else(|| "true".to_string());
    Json(serde_json::json!({"recording": recording}))
}

#[derive(Deserialize)]
pub struct SettingPayload {
    recording: String,
}

pub async fn handle_settings_post(
    Extension(db): Extension<Arc<Mutex<DB>>>,
    Json(payload): Json<SettingPayload>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    match db.set_setting("recording", &payload.recording) {
        Ok(_) => StatusCode::NO_CONTENT.into_response(),
        Err(e) => (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({"error": e.to_string()})),
        )
            .into_response(),
    }
}

// ---------- export ----------
pub async fn handle_export(
    Extension(db): Extension<Arc<Mutex<DB>>>,
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let db = db.lock().unwrap();
    let clips = match db.get_clips("") {
        Ok(c) => c,
        Err(e) => {
            return (
                StatusCode::INTERNAL_SERVER_ERROR,
                Json(serde_json::json!({"error": e.to_string()})),
            )
                .into_response()
        }
    };
    let format = params.get("format").map(String::as_str).unwrap_or("text");
    let (body, filename) = if format == "markdown" {
        let mut md = String::new();
        for clip in &clips {
            if clip.pinned {
                md.push_str(&format!("- **[PINNED]** {}\n", clip.content));
            } else {
                md.push_str(&format!("- {}\n", clip.content));
            }
        }
        (md, "clips.md")
    } else {
        let mut txt = String::new();
        for clip in &clips {
            if clip.pinned {
                txt.push_str(&format!("[PINNED] {}\n", clip.content));
            } else {
                txt.push_str(&format!("{}\n", clip.content));
            }
        }
        (txt, "clips.txt")
    };

    axum::response::Response::builder()
        .header("Content-Type", "text/plain; charset=utf-8")
        .header("Content-Disposition", format!("attachment; filename=\"{}\"", filename))
        .body(Body::from(body))
        .unwrap()
}

// ---------- shutdown ----------
pub async fn handle_shutdown(
    Extension(db): Extension<Arc<Mutex<DB>>>,
) -> Response {
    // Checkpoint and cleanup while we still hold the lock.
    {
        let db = db.lock().unwrap();
        let _ = db.cleanup_unpinned_images();
        db.checkpoint();
    }
    // Spawn a thread to exit after a short delay so the HTTP 204 response
    // is fully flushed to the browser before the process dies.
    // Without this delay the browser gets ERR_CONNECTION_REFUSED and
    // reports "Shutdown failed" even though everything worked correctly.
    std::thread::spawn(|| {
        std::thread::sleep(std::time::Duration::from_millis(300));
        std::process::exit(0);
    });
    StatusCode::NO_CONTENT.into_response()
}

// ---------- view image ----------
/// Returns the safe base directories that image files are allowed to be served from.
/// This prevents path traversal attacks (e.g. `?path=../../Windows/SAM`).
fn allowed_image_dirs() -> Vec<std::path::PathBuf> {
    let mut dirs = Vec::new();
    if let Ok(profile) = std::env::var("USERPROFILE") {
        let base = std::path::Path::new(&profile);
        for sub in &[
            r"Pictures\Screenshots",
            r"OneDrive\Pictures\Screenshots",
            "Pictures",
        ] {
            dirs.push(base.join(sub));
        }
    }
    dirs
}

pub async fn handle_view_image(
    Query(params): Query<HashMap<String, String>>,
) -> impl IntoResponse {
    let path = match params.get("path") {
        Some(p) => p.clone(),
        None => return (StatusCode::BAD_REQUEST, "missing path parameter").into_response(),
    };
    let requested = std::path::Path::new(&path);
    // Resolve symlinks and `..` components before any comparison.
    let canonical = match requested.canonicalize() {
        Ok(c) => c,
        Err(_) => return (StatusCode::NOT_FOUND, "image file not found").into_response(),
    };
    // Enforce extension check on the canonical path.
    let ext = canonical
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    if ext != "png" && ext != "jpg" && ext != "jpeg" {
        return (StatusCode::BAD_REQUEST, "invalid image type").into_response();
    }
    // Enforce that the file lives inside one of the allowed directories.
    let allowed = allowed_image_dirs();
    let in_allowed = allowed.iter().any(|dir| {
        dir.canonicalize()
            .map(|d| canonical.starts_with(&d))
            .unwrap_or(false)
    });
    if !in_allowed {
        return (StatusCode::FORBIDDEN, "access denied").into_response();
    }
    match std::fs::read(&canonical) {
        Ok(data) => {
            let mime = if ext == "png" { "image/png" } else { "image/jpeg" };
            ([(axum::http::header::CONTENT_TYPE, mime)], data).into_response()
        }
        Err(_) => (StatusCode::INTERNAL_SERVER_ERROR, "failed to read file").into_response(),
    }
}

// ---------- reveal ----------
#[derive(Deserialize)]
pub struct RevealPayload {
    path: String,
}

pub async fn handle_reveal(
    Json(payload): Json<RevealPayload>,
) -> impl IntoResponse {
    let target = payload.path.trim().trim_matches('"').to_string();
    if target.is_empty() {
        return (StatusCode::BAD_REQUEST, "missing path").into_response();
    }
    let p = std::path::Path::new(&target);
    // Canonicalize to resolve symlinks and `..` before the existence check.
    let canonical = match p.canonicalize() {
        Ok(c) => c,
        Err(_) => return (StatusCode::NOT_FOUND, format!("path not found: {}", target)).into_response(),
    };
    // Only allow paths inside the current user's profile to prevent
    // an attacker from revealing arbitrary system paths.
    let allowed = std::env::var("USERPROFILE")
        .ok()
        .map(|p| std::path::PathBuf::from(p));
    if let Some(profile) = allowed {
        if let Ok(canonical_profile) = profile.canonicalize() {
            if !canonical.starts_with(&canonical_profile) {
                return (StatusCode::FORBIDDEN, "access denied").into_response();
            }
        }
    }
    if canonical.is_dir() {
        let _ = std::process::Command::new("explorer.exe").arg(&canonical).spawn();
    } else {
        let _ = std::process::Command::new("explorer.exe")
            .arg("/select,")
            .arg(&canonical)
            .spawn();
    }
    StatusCode::NO_CONTENT.into_response()
}

// ---------- sensitive indicator ----------
pub async fn handle_sensitive_indicator() -> impl IntoResponse {
    let block = sensitive::LAST_SENSITIVE_BLOCK.lock().unwrap().clone();
    match block {
        Some(info) => Json(serde_json::json!({
            "blocked": true,
            "snippet": info.snippet,
            "timestamp": info.timestamp,
        }))
        .into_response(),
        None => Json(serde_json::json!({"blocked": false})).into_response(),
    }
}