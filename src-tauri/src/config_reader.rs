use serde::Serialize;
use std::{
    env, fs,
    path::{Path, PathBuf},
};

const DEFAULT_GATEWAY_HOST: &str = "127.0.0.1";
const DEFAULT_GATEWAY_PORT: u16 = 18789;

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

struct ParsedGatewayConfig {
    token: Option<String>,
    port: Option<u16>,
    host: Option<String>,
    url: Option<String>,
}

fn get_json_str<'a>(json: &'a serde_json::Value, pointer: &str) -> Option<&'a str> {
    json.pointer(pointer).and_then(|v| v.as_str())
}

fn normalize_non_empty(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn normalize_gateway_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    if trimmed.starts_with("ws://") || trimmed.starts_with("wss://") {
        return Some(trimmed.to_string());
    }

    if let Some(rest) = trimmed.strip_prefix("http://") {
        return Some(format!("ws://{}", rest));
    }

    if let Some(rest) = trimmed.strip_prefix("https://") {
        return Some(format!("wss://{}", rest));
    }

    None
}

fn parse_openclaw_config(path: &Path) -> Result<ParsedGatewayConfig, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("failed to read config: {}", e))?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("failed to parse config: {}", e))?;

    let token = get_json_str(&json, "/gateway/auth/token")
        .or_else(|| get_json_str(&json, "/gateway/token"))
        .or_else(|| get_json_str(&json, "/auth/token"))
        .and_then(normalize_non_empty);

    let port = json
        .pointer("/gateway/port")
        .and_then(|v| v.as_u64())
        .or_else(|| json.pointer("/port").and_then(|v| v.as_u64()))
        .map(|p| p as u16);

    let host = get_json_str(&json, "/gateway/host")
        .or_else(|| get_json_str(&json, "/host"))
        .and_then(normalize_non_empty);

    let url = [
        "/gateway/url",
        "/gateway/wsUrl",
        "/gateway/ws_url",
        "/gateway/websocketUrl",
        "/gateway/websocket_url",
    ]
    .iter()
    .find_map(|pointer| get_json_str(&json, pointer))
    .and_then(normalize_gateway_url);

    Ok(ParsedGatewayConfig {
        token,
        port,
        host,
        url,
    })
}

fn parse_openclaw_workspace(path: &Path) -> Result<Option<String>, String> {
    let content = fs::read_to_string(path).map_err(|e| format!("failed to read config: {}", e))?;
    let json: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("failed to parse config: {}", e))?;

    let from_defaults = get_json_str(&json, "/agents/defaults/workspace")
        .or_else(|| get_json_str(&json, "/agents/workspace"))
        .or_else(|| get_json_str(&json, "/workspace"))
        .and_then(normalize_non_empty);

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
                .and_then(normalize_non_empty)
        });

    Ok(from_default_agent)
}

#[cfg(windows)]
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
                push_unique(&mut candidates, candidate);
            }
        }
    }

    candidates
}

#[cfg(not(windows))]
fn find_wsl_config_paths() -> Vec<PathBuf> {
    Vec::new()
}

fn push_unique(paths: &mut Vec<PathBuf>, candidate: PathBuf) {
    if !paths.iter().any(|p| p == &candidate) {
        paths.push(candidate);
    }
}

fn push_env_path_list(paths: &mut Vec<PathBuf>, var_name: &str) {
    let Ok(raw) = env::var(var_name) else {
        return;
    };

    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return;
    }

    let mut pushed_any = false;
    for path in env::split_paths(trimmed) {
        if path.as_os_str().is_empty() {
            continue;
        }
        push_unique(paths, path);
        pushed_any = true;
    }

    if !pushed_any {
        push_unique(paths, PathBuf::from(trimmed));
    }
}

fn candidate_config_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    push_env_path_list(&mut paths, "OPENCLAW_CONFIG_PATH");
    push_env_path_list(&mut paths, "OPENCLAW_WSL_CONFIG_PATH");

    if let Some(home) = dirs::home_dir() {
        push_unique(&mut paths, home.join(".openclaw").join("openclaw.json"));
        push_unique(
            &mut paths,
            home.join(".config").join("openclaw").join("openclaw.json"),
        );

        #[cfg(target_os = "macos")]
        {
            push_unique(
                &mut paths,
                home.join("Library")
                    .join("Application Support")
                    .join("openclaw")
                    .join("openclaw.json"),
            );
            push_unique(
                &mut paths,
                home.join("Library")
                    .join("Application Support")
                    .join("OpenClaw")
                    .join("openclaw.json"),
            );
        }
    }

    if let Some(config_dir) = dirs::config_dir() {
        push_unique(&mut paths, config_dir.join("openclaw").join("openclaw.json"));
        push_unique(&mut paths, config_dir.join("OpenClaw").join("openclaw.json"));
    }

    for path in find_wsl_config_paths() {
        push_unique(&mut paths, path);
    }

    paths
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

fn push_workspace_identity_candidates(paths: &mut Vec<PathBuf>, workspace: &Path) {
    let is_markdown = workspace
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.eq_ignore_ascii_case("md"))
        .unwrap_or(false);

    if is_markdown {
        push_unique(paths, workspace.to_path_buf());
        return;
    }

    push_identity_file_candidates(paths, workspace);
}

fn candidate_identity_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();

    push_env_path_list(&mut paths, "OPENCLAW_IDENTITY_PATH");

    if let Ok(raw_workspace_paths) = env::var("OPENCLAW_WORKSPACE_PATH") {
        for workspace in env::split_paths(&raw_workspace_paths) {
            if workspace.as_os_str().is_empty() {
                continue;
            }
            push_workspace_identity_candidates(&mut paths, &workspace);
        }
    }

    if let Some(home) = dirs::home_dir() {
        push_identity_file_candidates(&mut paths, &home.join(".openclaw").join("workspace"));
        push_identity_file_candidates(&mut paths, &home.join(".openclaw"));
        push_identity_file_candidates(&mut paths, &home.join(".config").join("openclaw"));
    }

    if let Some(config_dir) = dirs::config_dir() {
        push_identity_file_candidates(&mut paths, &config_dir.join("openclaw").join("workspace"));
        push_identity_file_candidates(&mut paths, &config_dir.join("openclaw"));
        push_identity_file_candidates(&mut paths, &config_dir.join("OpenClaw").join("workspace"));
        push_identity_file_candidates(&mut paths, &config_dir.join("OpenClaw"));
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
            push_workspace_identity_candidates(&mut paths, &workspace_path);
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

        let without_bullet = trimmed
            .strip_prefix('-')
            .or_else(|| trimmed.strip_prefix('*'))
            .map(|s| s.trim())
            .unwrap_or(trimmed);
        let Some((raw_key, raw_value)) = without_bullet.split_once(':') else {
            continue;
        };

        let key = raw_key
            .replace('*', "")
            .replace('`', "")
            .replace('_', "")
            .replace('#', "")
            .trim()
            .to_ascii_lowercase();

        if key != "name" {
            continue;
        }

        let value = raw_value
            .trim()
            .trim_matches('*')
            .trim_matches('`')
            .trim_matches('"')
            .trim();

        if !value.is_empty() {
            return Some(value.to_string());
        }
    }

    None
}

#[tauri::command]
pub fn read_openclaw_config() -> Result<OpenClawConfig, String> {
    let env_token = env::var("OPENCLAW_GATEWAY_TOKEN").ok();
    let env_port = env::var("OPENCLAW_GATEWAY_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok());
    let env_host = env::var("OPENCLAW_GATEWAY_HOST")
        .ok()
        .and_then(|s| normalize_non_empty(&s));
    let env_url = env::var("OPENCLAW_GATEWAY_URL")
        .ok()
        .and_then(|s| normalize_gateway_url(&s));

    let mut file_token = None;
    let mut file_port = None;
    let mut file_host = None;
    let mut file_url = None;

    for path in candidate_config_paths() {
        if !path.exists() {
            continue;
        }

        if let Ok(parsed) = parse_openclaw_config(&path) {
            file_token = parsed.token;
            file_port = parsed.port;
            file_host = parsed.host;
            file_url = parsed.url;
            break;
        }
    }

    Ok(OpenClawConfig {
        token: env_token.or(file_token),
        port: env_port.or(file_port).unwrap_or(DEFAULT_GATEWAY_PORT),
        host: env_host
            .or(file_host)
            .unwrap_or_else(|| DEFAULT_GATEWAY_HOST.to_string()),
        url: env_url.or(file_url),
    })
}

#[tauri::command]
pub fn read_openclaw_identity() -> Result<OpenClawIdentity, String> {
    let env_name = env::var("OPENCLAW_IDENTITY_NAME")
        .ok()
        .and_then(|s| normalize_non_empty(&s));

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
