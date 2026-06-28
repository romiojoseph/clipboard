use crate::store::db::DB;
use axum::{Extension, Router};
use std::sync::{Arc, Mutex};
use tower_http::cors::CorsLayer;

use super::handlers;

pub async fn start_server(db: Arc<Mutex<DB>>, addr: &str) {
    let app = Router::new()
        .route(
            "/api/clips",
            axum::routing::get(handlers::handle_clips_get)
                .post(handlers::handle_clips_post)
                .delete(handlers::handle_clips_clear),
        )
        .route(
            "/api/clips/:id",
            axum::routing::delete(handlers::handle_clip_delete)
                .patch(handlers::handle_clip_patch),
        )
        .route(
            "/api/settings",
            axum::routing::get(handlers::handle_settings_get)
                .post(handlers::handle_settings_post),
        )
        .route("/api/export", axum::routing::get(handlers::handle_export))
        .route("/api/shutdown", axum::routing::post(handlers::handle_shutdown))
        .route(
            "/api/view-image",
            axum::routing::get(handlers::handle_view_image),
        )
        .route("/api/reveal", axum::routing::post(handlers::handle_reveal))
        .route(
            "/api/sensitive-indicator",
            axum::routing::get(handlers::handle_sensitive_indicator),
        )
        .layer(Extension(db.clone()))
        .fallback(handlers::static_handler)
        // Restrict CORS to localhost only — permissive CORS would allow any page
        // to read/modify clipboard data if the user visits a malicious site.
        .layer(
            CorsLayer::new()
                .allow_origin([
                    "http://127.0.0.1:1947"
                        .parse::<axum::http::HeaderValue>()
                        .unwrap(),
                    "http://localhost:1947"
                        .parse::<axum::http::HeaderValue>()
                        .unwrap(),
                ])
                .allow_methods([
                    axum::http::Method::GET,
                    axum::http::Method::POST,
                    axum::http::Method::PATCH,
                    axum::http::Method::DELETE,
                ])
                .allow_headers([axum::http::header::CONTENT_TYPE]),
        )
        // Reject request bodies larger than 1 MB to prevent memory exhaustion.
        .layer(axum::extract::DefaultBodyLimit::max(1024 * 1024));

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}