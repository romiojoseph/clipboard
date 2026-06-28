#![allow(dead_code)]

use crate::store::db::DB;
use std::sync::{Arc, Mutex};
use windows::Win32::UI::Input::KeyboardAndMouse::{
    RegisterHotKey, MOD_ALT, MOD_CONTROL, VIRTUAL_KEY,
};
use windows::Win32::UI::WindowsAndMessaging::{GetMessageW, MSG, WM_HOTKEY};

// Hotkey IDs
const HK_OPEN_UI: i32 = 0;     // Ctrl+Alt+` (backtick) → open UI window
const HK_PIN_1: i32   = 1;     // Ctrl+Alt+1 → copy 1st pinned clip
const HK_PIN_2: i32   = 2;     // Ctrl+Alt+2 → copy 2nd pinned clip
const HK_PIN_3: i32   = 3;     // Ctrl+Alt+3 → copy 3rd pinned clip
const HK_PIN_4: i32   = 4;     // Ctrl+Alt+4 → copy 4th pinned clip
const HK_PIN_5: i32   = 5;     // Ctrl+Alt+5 → copy 5th pinned clip

pub fn register_hotkeys(db: Arc<Mutex<DB>>) {
    unsafe {
        // Ctrl+Alt+` (VK 0xC0) — open UI window
        if let Err(e) = RegisterHotKey(None, HK_OPEN_UI, MOD_CONTROL | MOD_ALT, 0xC0) {
            eprintln!("Failed to register open-UI hotkey: {:?}", e);
        }

        // Ctrl+Alt+1..5 — paste pinned clips
        for i in 1..=5 {
            let key = VIRTUAL_KEY(0x30 + i as u16);
            if let Err(e) = RegisterHotKey(None, i, MOD_CONTROL | MOD_ALT, key.0 as u32) {
                eprintln!("Failed to register hotkey {}: {:?}", i, e);
            }
        }
    }

    loop {
        let mut msg = MSG::default();
        let ret = unsafe { GetMessageW(&mut msg, None, 0, 0) };
        if ret.0 <= 0 {
            break;
        }
        if msg.message == WM_HOTKEY {
            let id = msg.wParam.0 as i32;

            if id == HK_OPEN_UI {
                crate::windows_utils::open_app_window("http://127.0.0.1:1947");
                continue;
            }

            if id >= HK_PIN_1 && id <= HK_PIN_5 {
                let db = db.lock().unwrap();
                if let Ok(clips) = db.get_clips("") {
                    let pinned: Vec<_> = clips.into_iter().filter(|c| c.pinned).collect();
                    if let Some(clip) = pinned.get((id - 1) as usize) {
                        if !clip.content.starts_with("[FILE]:") {
                            if let Ok(mut c) = arboard::Clipboard::new() {
                                let _ = c.set_text(&clip.content);
                            }
                        }
                    }
                }
            }
        }
    }
}