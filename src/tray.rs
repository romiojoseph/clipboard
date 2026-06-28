use crate::store::db::DB;
use std::sync::{Arc, Mutex};
use tray_icon::menu::{Menu, MenuItem, PredefinedMenuItem};

const ID_OPEN_UI: &str = "open_ui";
const ID_RECORDING: &str = "recording";
const ID_QUIT: &str = "quit";
const ID_CLIP_PREFIX: &str = "clip_";

pub fn build_tray_menu(db: Arc<Mutex<DB>>) -> Menu {
    let db_lock = db.lock().unwrap();
    let menu = Menu::new();

    let open_item = MenuItem::with_id(ID_OPEN_UI, "Open UI", true, None);
    let _ = menu.append(&open_item);

    let _ = menu.append(&PredefinedMenuItem::separator());

    let recording = db_lock
        .get_setting("recording")
        .ok()
        .flatten()
        .unwrap_or_else(|| "true".to_string());
    let is_recording = recording == "true";
    let label = if is_recording {
        "Store Clipboard: On"
    } else {
        "Store Clipboard: Off"
    };
    let toggle_item = MenuItem::with_id(ID_RECORDING, label, true, None);
    let _ = menu.append(&toggle_item);

    let _ = menu.append(&PredefinedMenuItem::separator());

    if let Ok(clips) = db_lock.get_clips("") {
        let limit = clips.len().min(10);
        for i in 0..limit {
            let clip = &clips[i];
            let display_clean = clip.content.replace('\n', " ").replace('\r', "");
            let display = if display_clean.chars().count() > 30 {
                format!("{}...", display_clean.chars().take(27).collect::<String>())
            } else {
                display_clean
            };
            let id = format!("{}{}", ID_CLIP_PREFIX, i);
            let item = MenuItem::with_id(id, display, true, None);
            let _ = menu.append(&item);
        }
        if limit > 0 {
            let _ = menu.append(&PredefinedMenuItem::separator());
        }
    }

    let quit_item = MenuItem::with_id(ID_QUIT, "Quit", true, None);
    let _ = menu.append(&quit_item);

    menu
}

pub fn handle_menu_event(id: &str, db: &Arc<Mutex<DB>>) {
    match id {
        ID_OPEN_UI => {
            crate::windows_utils::open_app_window("http://127.0.0.1:1947");
        }
        ID_RECORDING => {
            let db = db.lock().unwrap();
            let current = db
                .get_setting("recording")
                .ok()
                .flatten()
                .unwrap_or_else(|| "true".to_string());
            let new_val = if current == "true" { "false" } else { "true" };
            let _ = db.set_setting("recording", &new_val);
        }
        ID_QUIT => {
            let db = db.lock().unwrap();
            let _ = db.cleanup_unpinned_images();
            db.checkpoint();
            // Close the UI window (separate Chrome process) before we exit.
            crate::windows_utils::close_app_window();
            std::thread::sleep(std::time::Duration::from_millis(200));
            std::process::exit(0);
        }
        _ => {
            if let Some(idx_str) = id.strip_prefix(ID_CLIP_PREFIX) {
                if let Ok(idx) = idx_str.parse::<usize>() {
                    let db = db.lock().unwrap();
                    if let Ok(clips) = db.get_clips("") {
                        if let Some(clip) = clips.get(idx) {
                            if !clip.content.starts_with("[FILE]:") {
                                if let Ok(mut c) = arboard::Clipboard::new() {
                                    let _ = c.set_text(&clip.content);
                                }
                                let _content = clip.content.clone();
                                std::thread::spawn(move || {
                                    std::thread::sleep(std::time::Duration::from_millis(100));
                                    crate::windows_utils::paste_active_window();
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}