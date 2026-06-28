use std::ffi::OsStr;
use std::os::windows::ffi::OsStrExt;
use std::thread::sleep;
use std::time::Duration;
use windows::core::PCWSTR;
use windows::Win32::UI::Input::KeyboardAndMouse::{
    keybd_event, KEYBD_EVENT_FLAGS, VK_CONTROL, VK_V,
};
use windows::Win32::UI::WindowsAndMessaging::{
    FindWindowW, PostMessageW, SetForegroundWindow, ShowWindow, SW_MAXIMIZE, WM_CLOSE,
};

pub fn open_app_window(url: &str) {
    if bring_window_to_front() {
        return;
    }
    let chrome = std::process::Command::new(
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    )
    .arg(format!("--app={}", url))
    .arg("--start-maximized")
    .spawn();
    if chrome.is_err() {
        if let Err(e) = webbrowser::open(url) {
            eprintln!("Failed to open browser: {}", e);
        }
        return;
    }
    sleep(Duration::from_millis(1500));
    bring_window_to_front();
}

fn bring_window_to_front() -> bool {
    unsafe {
        let title: Vec<u16> = OsStr::new("Clipboard")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let hwnd = FindWindowW(None, PCWSTR::from_raw(title.as_ptr()));
        if hwnd.0 == 0 {
            return false;
        }
        ShowWindow(hwnd, SW_MAXIMIZE);
        SetForegroundWindow(hwnd);
        true
    }
}

pub fn paste_active_window() {
    unsafe {
        keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_V.0 as u8, 0, KEYBD_EVENT_FLAGS(0), 0);
        keybd_event(VK_V.0 as u8, 0, KEYBD_EVENT_FLAGS(2), 0);
        keybd_event(VK_CONTROL.0 as u8, 0, KEYBD_EVENT_FLAGS(2), 0);
    }
}

/// Send WM_CLOSE to the clipboard app window (if it exists).
/// The Chrome --app window is a separate OS process, so killing the Rust
/// process alone does not close it.
pub fn close_app_window() {
    unsafe {
        let title: Vec<u16> = std::ffi::OsStr::new("Clipboard")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        let hwnd = FindWindowW(None, windows::core::PCWSTR::from_raw(title.as_ptr()));
        if hwnd.0 != 0 {
            // PostMessageW is fire-and-forget; it doesn't block waiting for
            // the window to process the message.
            let _ = PostMessageW(hwnd, WM_CLOSE, None, None);
        }
    }
}