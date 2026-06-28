fn main() {
    if std::env::var("CARGO_CFG_TARGET_OS").unwrap() == "windows" {
        let mut res = winres::WindowsResource::new();
        res.set_icon("web/public/icon.ico");
        res.set("FileDescription", "Clipboard Manager");
        res.set("FileVersion", "1.0.0");
        res.set("InternalName", "Clipboard");
        res.set("LegalCopyright", "Copyright © 2026 Romio Joseph");
        res.set("OriginalFilename", "clipboard.exe");
        res.set("ProductName", "Clipboard");
        res.set("ProductVersion", "1.0.0");
        res.set("CompanyName", "Instances");
        res.compile().unwrap();
    }
}
