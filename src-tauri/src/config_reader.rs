use serde::Serialize;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
pub struct OpenClawConfig {
    pub token: Option<String>,
    pub port: u16,
    pub host: String,
    pub url: Option<String>,
}

fn parse_openclaw_config(path: &Path) -> Result<(Option<String>, Option<u16>, Option<String>), String> {
    let content = fs::read_to_string(path).map_err(|e| format!("failed to read config: {}", e))?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("failed to parse config: {}", e))?;

    let token = json
        .pointer("/gateway/auth/token")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());
    let port = json
        .pointer("/gateway/port")
        .and_then(|v| v.as_u64())
        .map(|p| p as u16);
    let host = json
        .pointer("/gateway/host")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    Ok((token, port, host))
}

fn find_wsl_config_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    let wsl_root = Path::new(r"\\wsl$");

    let distros = match fs::read_dir(wsl_root) {
        Ok(entries) => entries,
        Err(_) => return candidates,
    };

    for distro in distros.flatten() {
        let is_dir = distro.file_type().map(|t| t.is_dir()).unwrap_or(false);
        if !is_dir {
            continue;
        }

        let users_home = distro.path().join("home");
        let users = match fs::read_dir(&users_home) {
            Ok(entries) => entries,
            Err(_) => continue,
        };

        for user in users.flatten() {
            let user_is_dir = user.file_type().map(|t| t.is_dir()).unwrap_or(false);
            if !user_is_dir {
                continue;
            }

            let candidate = user.path().join(".openclaw").join("openclaw.json");
            if candidate.exists() {
                candidates.push(candidate);
            }
        }
    }

    candidates
}

fn candidate_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(explicit) = std::env::var("OPENCLAW_CONFIG_PATH") {
        let explicit = explicit.trim();
        if !explicit.is_empty() {
            paths.push(PathBuf::from(explicit));
        }
    }

    if let Some(home) = dirs::home_dir() {
        paths.push(home.join(".openclaw").join("openclaw.json"));
    }

    if let Ok(wsl_explicit) = std::env::var("OPENCLAW_WSL_CONFIG_PATH") {
        let wsl_explicit = wsl_explicit.trim();
        if !wsl_explicit.is_empty() {
            paths.push(PathBuf::from(wsl_explicit));
        }
    }

    paths.extend(find_wsl_config_paths());
    paths
}

#[tauri::command]
pub fn read_openclaw_config() -> Result<OpenClawConfig, String> {
    // Try environment variable first
    let env_token = std::env::var("OPENCLAW_GATEWAY_TOKEN").ok();
    let env_port = std::env::var("OPENCLAW_GATEWAY_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok());
    let env_host = std::env::var("OPENCLAW_GATEWAY_HOST")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());
    let env_url = std::env::var("OPENCLAW_GATEWAY_URL")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let mut file_token = None;
    let mut file_port = None;
    let mut file_host = None;

    for path in candidate_config_paths() {
        if !path.exists() {
            continue;
        }
        if let Ok((token, port, host)) = parse_openclaw_config(&path) {
            file_token = token;
            file_port = port;
            file_host = host;
            break;
        }
    }

    // Env vars take precedence
    Ok(OpenClawConfig {
        token: env_token.or(file_token),
        port: env_port.or(file_port).unwrap_or(18789),
        host: env_host
            .or(file_host)
            .unwrap_or_else(|| "127.0.0.1".to_string()),
        url: env_url,
    })
}
