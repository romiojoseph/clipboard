# Clipboard

Local clipboard manager for Windows with system tray integration and web dashboard.

Built with: Rust · React · Vite

> This is a vibe coded project. I built this entirely with AI assistance. I handled the frontend design and UX; the Rust backend was AI-generated and iterated on through prompting. Use it or fork it.

I haven't shared the binary file with this repo, especially because it is vibe-coded. If you need it, please clone it and run the build script.

#### Features
- Stays in the system tray; one click to open.
- Text clips persist until cleared. Screenshots are lost on quit (not window close), but pinned items stay until manually cleared.
- Auto-detects and tags folder paths, URLs, code, commands, passwords, tokens, and similar content.
- Syntax highlighting for code clips.
- Merge multiple clips into one.
- Export selected clips as a .txt file, or pin, copy, delete or assign tags to them.
- Edit clips inline.
- UI-level masking for auto-detected sensitive content — not encrypted, display only.
- Sort and filter to manage your clip feed.
- Manually add clips or import from .txt or .md files.
- Toggle the app on or off from settings.
- Right-click the tray icon to quickly access recent clips or toggle the app.
- Clear All removes all unpinned clips from the feed.
- To quickly open the window (only when the tray icon is active) press `Ctrl + Alt + (backtick)`
- Closing the window won't quit the app, it minimizes to the tray and runs as a background process. Last checked, it uses under 10 MB of RAM.

## Requirements & Setup

Clone `git clone https://github.com/romiojoseph/clipboard.git`

### 1. Node.js (v18+)
- Install via the official installer at [nodejs.org](https://nodejs.org/).
- Verify installation by running in your terminal:
  ```bash
  node --version
  npm --version
  ```

### 2. Rust & Cargo
- **Installation**:
  1. Download and run `rustup-init.exe` from [rustup.rs](https://rustup.rs/).
  2. A terminal window will open. Select option `1) Proceed with installation (default)`.
  3. Close and reopen your terminal/IDE to apply the new system environment variables.
- **Verification**: Verify that the compiler and build system are ready:
  ```bash
  rustc --version
  cargo --version
  ```

## Development

1. Install frontend dependencies:
   ```bash
   cd web
   npm install
   cd ..
   ```

2. Run the development environment. This starts the Vite dev server for the frontend on port 1950 and compiles/runs the Rust backend on port 1947:
   ```powershell
   .\dev-rust.ps1
   ```

   *Under the hood, this script runs:*
   - `cd web; npm run dev` (starts the local dev server)
   - `cargo run` (compiles and runs the backend binary in debug mode)

## Production Build

You can build the production-ready executable using the helper script:
```powershell
.\build.ps1
```

*Under the hood, this script performs these manual steps:*

1. Build the static frontend assets:
   ```bash
   cd web
   npm run build
   cd ..
   ```
   This compiles the React code and generates the static assets in `web/dist/`.

2. Compile the Rust executable in release mode:
   ```bash
   cargo build --release
   ```
   This builds the final, optimized binary. The Rust build process embeds the compiled frontend assets from `web/dist/` into the binary itself.

The final compiled binary is generated at: `.\bin\clipboard.exe`

This is a small, portable app. Opening it will create a `clipboard.db` file in the same directory as the exe. This is your source of truth. Deleting it will result in data loss, so make sure to back it up occasionally.

*Run `cargo clean` to clean up the target/ directory*

*This app loads fonts via Bunny Fonts*

*Binary is compressed with [UPX](https://github.com/upx/upx/releases/tag/v5.2.0).*