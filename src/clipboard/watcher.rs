use crate::sensitive;
use crate::store::db::DB;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

pub fn clipboard_watcher(db: Arc<Mutex<DB>>) {
    let mut last_text = String::new();
    // Reuse a single Clipboard handle across iterations; re-create only on error.
    let mut clipboard = loop {
        match arboard::Clipboard::new() {
            Ok(c) => break c,
            Err(_) => thread::sleep(Duration::from_millis(500)),
        }
    };
    loop {
        thread::sleep(Duration::from_millis(1500));
        let recording = {
            let db = db.lock().unwrap();
            db.get_setting("recording")
                .ok()
                .flatten()
                .unwrap_or_else(|| "true".to_string())
        };

        let text = match clipboard.get_text() {
            Ok(t) => t.trim().to_string(),
            Err(_) => {
                // Re-create the handle on error (clipboard may have become unavailable).
                clipboard = match arboard::Clipboard::new() {
                    Ok(c) => c,
                    Err(_) => continue,
                };
                continue;
            }
        };

        if recording == "false" {
            last_text = text; // Keep last_text in sync so we don't capture it when turned back on
            continue;
        }

        if text.is_empty() || text == last_text {
            continue;
        }
        last_text = text.clone();

        // Sensitive content detection → update indicator but still save.
        // The clip gets auto-tagged "Passwords" by detect_tags() and masked in the UI.
        if sensitive::is_sensitive_content(&text) {
            let snippet = if text.chars().count() > 50 {
                format!("{}...", text.chars().take(50).collect::<String>())
            } else {
                text.clone()
            };
            let mut block = sensitive::LAST_SENSITIVE_BLOCK.lock().unwrap();
            *block = Some(sensitive::SensitiveBlockInfo {
                snippet,
                timestamp: chrono::Utc::now(),
            });
            // Fall through — save the clip so nothing is silently lost.
        }

        // Save clip
        let db = db.lock().unwrap();
        if let Err(e) = db.save_clip(&text) {
            eprintln!("failed to save clip: {}", e);
        }
    }
}

pub fn screenshot_watcher(db: Arc<Mutex<DB>>) {
    let dirs = get_screenshots_dirs();
    if dirs.is_empty() {
        return;
    }
    let start_time = chrono::Utc::now();

    loop {
        thread::sleep(Duration::from_millis(1500));
        let recording = {
            let db = db.lock().unwrap();
            db.get_setting("recording")
                .ok()
                .flatten()
                .unwrap_or_else(|| "true".to_string())
        };
        if recording == "false" {
            continue;
        }

        for dir in &dirs {
            if let Ok(entries) = std::fs::read_dir(dir) {
                for entry in entries.flatten() {
                    if let Ok(ft) = entry.file_type() {
                        if !ft.is_file() {
                            continue;
                        }
                        let path = entry.path();
                        let ext = path
                            .extension()
                            .and_then(|e| e.to_str())
                            .unwrap_or("")
                            .to_lowercase();
                        if ext != "png" && ext != "jpg" && ext != "jpeg" {
                            continue;
                        }
                        if let Ok(meta) = path.metadata() {
                            if let Ok(modified) = meta.modified() {
                                let modified: chrono::DateTime<chrono::Utc> = modified.into();
                                if modified < start_time {
                                    continue;
                                }
                            }
                        }
                        let db_content = format!("[FILE]:{}", path.display());
                        // Acquire and release the lock for each file individually
                        // so we don't hold it across the entire directory iteration.
                        let db = db.lock().unwrap();
                        match db.clip_exists(&db_content) {
                            Ok(false) => {
                                let _ = db.save_clip(&db_content);
                            }
                            _ => {}
                        }
                        // db lock is dropped here at end of scope
                    }
                }
            }
        }
    }
}

fn get_screenshots_dirs() -> Vec<std::path::PathBuf> {
    let profile = match std::env::var("USERPROFILE") {
        Ok(p) => p,
        Err(_) => return vec![],
    };
    let mut dirs = vec![];
    for sub in &[
        r"Pictures\Screenshots",
        r"OneDrive\Pictures\Screenshots",
    ] {
        let full = std::path::Path::new(&profile).join(sub);
        if full.exists() {
            dirs.push(full);
        }
    }
    dirs
}