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

#[derive(Serialize)]
pub struct OpenClawIdentity {
    pub name: Option<String>,
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

fn parse_openclaw_workspace(path: &Path) -> Result<Option<String>, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("failed to read config: {}", e))?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("failed to parse config: {}", e))?;

    let from_defaults = json
        .pointer("/agents/defaults/workspace")
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if from_defaults.is_some() {
        return Ok(from_defaults);
    }

    let from_default_agent = json
        .pointer("/agents/list")
        .and_then(|v| v.as_array())
        .and_then(|list| {
            list.iter()
                .find(|entry| entry.get("default").and_then(|v| v.as_bool()) == Some(true))
                .and_then(|entry| entry.get("workspace"))
                .and_then(|v| v.as_str())
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty())
        });

    Ok(from_default_agent)
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

fn push_unique(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|p| p == &candidate) {
        paths.push(candidate);
    }
}

fn wsl_distro_from_unc_path(path: &Path) -> Option<String> {
    let raw = path.to_string_lossy().replace('/', "\\");
    let prefix = "\\\\wsl$\\";
    if !raw.to_ascii_lowercase().starts_with(&prefix.to_ascii_lowercase()) {
        return None;
    }

    raw[prefix.len()..]
        .split('\\')
        .next()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

fn wsl_user_from_unc_path(path: &Path) -> Option<String> {
    let raw = path.to_string_lossy().replace('/', "\\");
    let prefix = "\\\\wsl$\\";
    if !raw.to_ascii_lowercase().starts_with(&prefix.to_ascii_lowercase()) {
        return None;
    }

    let parts: Vec<&str> = raw[prefix.len()..].split('\\').collect();
    for (idx, part) in parts.iter().enumerate() {
        if part.eq_ignore_ascii_case("home") {
            return parts
                .get(idx + 1)
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
        }
    }
    None
}

fn to_wsl_unc_path(distro: &str, linux_path: &str) -> PathBuf {
    let rel = linux_path.trim_start_matches('/').replace('/', "\\");
    if rel.is_empty() {
        PathBuf::from(format!("\\\\wsl$\\{}", distro))
    } else {
        PathBuf::from(format!("\\\\wsl$\\{}\\{}", distro, rel))
    }
}

fn resolve_workspace_path(config_path: &Path, raw_workspace: &str) -> PathBuf {
    let trimmed = raw_workspace.trim();

    if let Some(remainder) = trimmed.strip_prefix("~/") {
        if let (Some(distro), Some(user)) = (
            wsl_distro_from_unc_path(config_path),
            wsl_user_from_unc_path(config_path),
        ) {
            return to_wsl_unc_path(&distro, &format!("/home/{}/{}", user, remainder));
        }
        if let Some(home) = dirs::home_dir() {
            return home.join(remainder);
        }
    }

    if trimmed.starts_with('/') {
        if let Some(distro) = wsl_distro_from_unc_path(config_path) {
            return to_wsl_unc_path(&distro, trimmed);
        }
        return PathBuf::from(trimmed);
    }

    let workspace = PathBuf::from(trimmed);
    if workspace.is_absolute() {
        return workspace;
    }

    config_path
        .parent()
        .map(|parent| parent.join(workspace.clone()))
        .unwrap_or(workspace)
}

fn push_identity_file_candidates(paths: &mut Vec<PathBuf>, base_dir: &Path) {
    push_unique(paths, base_dir.join("IDENTITY.md"));
    push_unique(paths, base_dir.join("identity.md"));
}

fn candidate_identity_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    if let Ok(explicit) = std::env::var("OPENCLAW_IDENTITY_PATH") {
        let explicit = explicit.trim();
        if !explicit.is_empty() {
            push_unique(&mut paths, PathBuf::from(explicit));
        }
    }

    // User-provided path priority
    push_unique(
        &mut paths,
        PathBuf::from(r"\\wsl$\Ubuntu\home\dopping\.openclaw\workspace\IDENTITY.md"),
    );
    push_unique(
        &mut paths,
        PathBuf::from(r"\\wsl$\Ubuntu\home\dopping\.openclaw\workspace\identity.md"),
    );

    if let Ok(workspace) = std::env::var("OPENCLAW_WORKSPACE_PATH") {
        let workspace = workspace.trim();
        if !workspace.is_empty() {
            push_identity_file_candidates(&mut paths, Path::new(workspace));
        }
    }

    if let Some(home) = dirs::home_dir() {
        push_identity_file_candidates(&mut paths, &home.join(".openclaw").join("workspace"));
        push_identity_file_candidates(&mut paths, &home.join(".openclaw"));
    }

    for config_path in candidate_config_paths() {
        if !config_path.exists() {
            continue;
        }

        if let Some(config_dir) = config_path.parent() {
            push_identity_file_candidates(&mut paths, &config_dir.join("workspace"));
            push_identity_file_candidates(&mut paths, config_dir);
        }

        if let Ok(Some(workspace_raw)) = parse_openclaw_workspace(&config_path) {
            let workspace_path = resolve_workspace_path(&config_path, &workspace_raw);
            push_identity_file_candidates(&mut paths, &workspace_path);
        }
    }

    paths
}

fn parse_identity_name(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let without_bullet = trimmed.strip_prefix('-').map(|s| s.trim()).unwrap_or(trimmed);
        let Some((raw_key, raw_value)) = without_bullet.split_once(':') else {
            continue;
        };

        let key = raw_key
            .replace('*', "")
            .replace('`', "")
            .replace('_', "")
            .trim()
            .to_ascii_lowercase();

        if key != "name" {
            continue;
        }

        let value = raw_value
            .trim()
            .trim_matches('*')
            .trim_matches('`')
            .trim();

        if !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
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

#[tauri::command]
pub fn read_openclaw_identity() -> Result<OpenClawIdentity, String> {
    let env_name = std::env::var("OPENCLAW_IDENTITY_NAME")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    if env_name.is_some() {
        return Ok(OpenClawIdentity { name: env_name });
    }

    for path in candidate_identity_paths() {
        if !path.exists() {
            continue;
        }

        let bytes = match fs::read(&path) {
            Ok(bytes) => bytes,
            Err(_) => continue,
        };

        let content = String::from_utf8_lossy(&bytes);
        if let Some(name) = parse_identity_name(&content) {
            return Ok(OpenClawIdentity { name: Some(name) });
        }
    }

    Ok(OpenClawIdentity { name: None })
}