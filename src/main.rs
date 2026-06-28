#![windows_subsystem = "windows"]

mod clipboard;
mod hotkeys;
mod sensitive;
mod server;
mod store;
mod tray;
mod windows_utils;

use std::sync::{Arc, Mutex};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;
use store::db::DB;
use tray_icon::menu::MenuEvent;
use tray_icon::{TrayIconBuilder, TrayIconEvent, ClickType};
use tao::event_loop::{ControlFlow, EventLoopBuilder};

fn main() {
    let exe_path = std::env::current_exe().expect("failed to get exe path");
    let exe_dir = exe_path.parent().expect("exe has no parent");
    let db_path = exe_dir.join("clipboard.db");
    let db = DB::new(db_path.to_str().unwrap()).expect("failed to open database");
    let db = Arc::new(Mutex::new(db));

    {
        let db = db.lock().unwrap();
        db.cleanup_unpinned_images().expect("cleanup failed");
    }

    let server_db = db.clone();
    thread::spawn(move || {
        // current_thread is sufficient — axum manages its own async tasks internally.
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        rt.block_on(server::server::start_server(server_db, "127.0.0.1:1947"));
    });

    thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(1));
        windows_utils::open_app_window("http://127.0.0.1:1947");
    });

    let watcher_db = db.clone();
    thread::spawn(move || clipboard::watcher::clipboard_watcher(watcher_db));
    let screenshot_db = db.clone();
    thread::spawn(move || clipboard::watcher::screenshot_watcher(screenshot_db));
    let hotkey_db = db.clone();
    thread::spawn(move || hotkeys::register_hotkeys(hotkey_db));

    // Run database change polling in a background thread to prevent blocking the GUI thread.
    // Uses a lightweight aggregate query instead of fetching all rows each tick.
    let (tx, rx) = mpsc::channel();
    let poll_db = db.clone();
    thread::spawn(move || {
        let mut last_sig: Option<(i64, String, String)> = None; // (count, max_created_at, recording)
        loop {
            std::thread::sleep(Duration::from_secs(1));
            if let Ok(db_lock) = poll_db.lock() {
                // Cheap aggregate — no row data transferred.
                let sig: Option<(i64, String)> = db_lock
                    .conn()
                    .query_row(
                        "SELECT COUNT(*), COALESCE(MAX(created_at), '') FROM clips",
                        [],
                        |row| Ok((row.get::<_, i64>(0)?, row.get::<_, String>(1)?)),
                    )
                    .ok();
                let recording = db_lock
                    .get_setting("recording")
                    .unwrap_or_default()
                    .unwrap_or_else(|| "true".to_string());

                let new_sig = sig.map(|(c, t)| (c, t, recording.clone()));
                if new_sig != last_sig {
                    last_sig = new_sig;
                    let _ = tx.send(());
                }
            }
        }
    });

    let event_loop = EventLoopBuilder::new().build();

    let tray_db = db.clone();
    let icon = load_tray_icon();
    let menu = tray::build_tray_menu(tray_db.clone());
    let tray_icon = TrayIconBuilder::new()
        .with_tooltip("Clipboard")
        .with_icon(icon)
        .with_menu(Box::new(menu))
        .build()
        .expect("failed to build tray icon");

    let rebuild_db = db.clone();

    event_loop.run(move |_event, _, control_flow| {
        *control_flow = ControlFlow::WaitUntil(std::time::Instant::now() + Duration::from_millis(100));

        // Check if database state changed in the background thread
        if let Ok(_) = rx.try_recv() {
            let new_menu = tray::build_tray_menu(rebuild_db.clone());
            let _ = tray_icon.set_menu(Some(Box::new(new_menu)));
        }

        // Handle Menu events
        if let Ok(event) = MenuEvent::receiver().try_recv() {
            tray::handle_menu_event(event.id.as_ref(), &db);
        }

        // Handle Tray Icon events (single-click or double-click to open UI)
        if let Ok(event) = TrayIconEvent::receiver().try_recv() {
            match event.click_type {
                ClickType::Left | ClickType::Double => {
                    windows_utils::open_app_window("http://127.0.0.1:1947");
                }
                _ => {}
            }
        }
    });
}

fn load_tray_icon() -> tray_icon::Icon {
    let icon_bytes = include_bytes!("../web/public/icon.png");
    let img = image::load_from_memory(icon_bytes)
        .expect("failed to load icon")
        .into_rgba8();
    let (w, h) = img.dimensions();
    let rgba = img.into_raw();
    tray_icon::Icon::from_rgba(rgba, w, h).expect("failed to create icon")
}