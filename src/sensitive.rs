use once_cell::sync::Lazy;
use std::sync::Mutex;

// ---------- tag detection (for auto-tagging) ----------
pub fn detect_tags(content: &str) -> String {
    let content = content.trim();
    if content.is_empty() {
        return String::new();
    }

    let mut tags = Vec::new();

    // Links
    if content.starts_with("http://")
        || content.starts_with("https://")
        || content.starts_with("ftp://")
    {
        tags.push("Links");
    }

    // Code
    if !content.starts_with("[FILE]:") {
        let is_code = (content.contains('{') && content.contains('}'))
            || (content.contains("import ") && (content.contains("from ") || content.contains("react")))
            || (content.contains("package ") && content.contains("func "))
            || (content.contains("def ") && content.contains(':') && content.contains('\n'))
            || (content.contains("const ") || content.contains("let ") || content.contains("function "))
            || (content.contains("<html>") || content.contains("</div>") || content.contains("class="));
        if is_code {
            tags.push("Code");
        }
    }

    // Media
    if content.starts_with("[FILE]:") {
        tags.push("Media");
    }

    // Passwords / Secrets
    if is_sensitive_content(content) {
        tags.push("Passwords");
    }

    // Paths
    let is_path = (content.len() >= 3
        && content.as_bytes()[1] == b':'
        && (content.as_bytes()[2] == b'\\' || content.as_bytes()[2] == b'/'))
        || content.starts_with("\\\\");
    if is_path {
        tags.push("Paths");
    }

    // Colors (Design)
    let lower = content.to_lowercase();
    let is_color = if lower.starts_with('#')
        && (lower.len() == 4 || lower.len() == 7 || lower.len() == 9)
    {
        lower[1..].chars().all(|c| c.is_ascii_hexdigit())
    } else {
        lower.starts_with("rgb(")
            || lower.starts_with("rgba(")
            || lower.starts_with("hsl(")
            || lower.starts_with("hsla(")
    };
    if is_color {
        tags.push("Design");
    }

    // Commands — terminal/shell commands
    if !content.starts_with("[FILE]:") && !tags.contains(&"Links") && !tags.contains(&"Paths") {
        let first_line = content.lines().next().unwrap_or("").trim();
        let is_command = {
            // Unix-style: starts with common shell builtins or CLI tools
            let unix_prefixes = [
                "ls ", "ls\t", "cd ", "pwd", "echo ", "cat ", "grep ", "find ", "rm ",
                "mv ", "cp ", "mkdir ", "chmod ", "chown ", "curl ", "wget ", "ssh ",
                "git ", "npm ", "yarn ", "pnpm ", "cargo ", "docker ", "kubectl ",
                "sudo ", "apt ", "brew ", "pip ", "python ", "python3 ", "node ",
                "make ", "cmake ", "go ", "rustc ", "gcc ", "clang ", "tar ", "zip ",
                "unzip ", "kill ", "ps ", "top ", "htop ", "export ", "source ",
                "chmod +", "bash ", "sh ", "zsh ", "fish ", "sed ", "awk ", "xargs ",
                "tee ", "head ", "tail ", "sort ", "uniq ", "wc ", "diff ",
            ];
            // Windows-style: cmd/PowerShell
            let win_prefixes = [
                "dir ", "del ", "copy ", "move ", "type ", "set ", "cls", "ipconfig",
                "ping ", "tracert ", "netstat", "tasklist", "taskkill ", "reg ",
                "sc ", "net ", "runas ", "powershell ", "pwsh ", "choco ",
                "winget ", "Get-", "Set-", "New-", "Remove-", "Invoke-", "Start-",
                "Stop-", "Write-", "Read-", "Select-", "Where-", "ForEach-",
                ".\\ ", "./ ",
            ];
            // Pipe or redirect characters signal a shell expression
            let has_shell_ops = (content.contains(" | ")
                || content.contains(" > ")
                || content.contains(" >> ")
                || content.contains(" 2>&1")
                || content.contains(" && ")
                || content.contains(" || "))
                && !tags.contains(&"Code");

            let first_lower = first_line.to_lowercase();
            unix_prefixes.iter().any(|p| first_lower.starts_with(p))
                || win_prefixes.iter().any(|p| first_lower.starts_with(&p.to_lowercase()))
                || has_shell_ops
                // bare commands: single token, no spaces, known extensions or exact matches
                || ["git", "npm", "yarn", "cargo", "docker", "kubectl", "make",
                    "pip", "go", "python", "python3", "node", "bash", "sh",
                    "pwsh", "powershell"].contains(&first_lower.as_str())
        };
        if is_command {
            tags.push("Commands");
        }
    }

    tags.join(",")
}

// ---------- sensitive content check (for blocking) ----------
pub fn is_sensitive_content(content: &str) -> bool {
    let is_url = content.starts_with("http://")
        || content.starts_with("https://")
        || content.starts_with("ftp://");
    let is_path = (content.len() >= 3
        && content.as_bytes()[1] == b':'
        && (content.as_bytes()[2] == b'\\' || content.as_bytes()[2] == b'/'))
        || content.starts_with("\\\\");

    // Known API key prefixes
    if (content.starts_with("sk-") || content.starts_with("ghp_")) && !is_url && !is_path {
        return true;
    }

    // Single-word, no spaces, length 12-128, high entropy (≥3 char categories)
    if !is_url && !is_path {
        let sw = content;
        if !sw.contains(' ') && !sw.contains('\n') && sw.len() >= 12 && sw.len() <= 128 {
            let mut has_upper = false;
            let mut has_lower = false;
            let mut has_digit = false;
            let mut has_special = false;
            for ch in sw.chars() {
                if ch.is_ascii_uppercase() {
                    has_upper = true;
                } else if ch.is_ascii_lowercase() {
                    has_lower = true;
                } else if ch.is_ascii_digit() {
                    has_digit = true;
                } else {
                    has_special = true;
                }
            }
            let mut cats = 0;
            if has_upper {
                cats += 1;
            }
            if has_lower {
                cats += 1;
            }
            if has_digit {
                cats += 1;
            }
            if has_special {
                cats += 1;
            }
            if cats >= 3 {
                return true;
            }
        }
    }

    false
}

// ---------- blocked indicator state ----------
pub static LAST_SENSITIVE_BLOCK: Lazy<Mutex<Option<SensitiveBlockInfo>>> =
    Lazy::new(|| Mutex::new(None));

#[derive(Clone, Debug, serde::Serialize)]
pub struct SensitiveBlockInfo {
    pub snippet: String,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}