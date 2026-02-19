use serde::Serialize;
use std::fs;

#[derive(Serialize)]
pub struct OpenClawConfig {
    pub token: Option<String>,
    pub port: u16,
}

#[tauri::command]
pub fn read_openclaw_config() -> Result<OpenClawConfig, String> {
    // Try environment variable first
    let env_token = std::env::var("OPENCLAW_GATEWAY_TOKEN").ok();
    let env_port = std::env::var("OPENCLAW_GATEWAY_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok());

    // Try reading from config file
    let home = dirs::home_dir().ok_or_else(|| "cannot determine home directory".to_string())?;
    let config_path = home.join(".openclaw").join("openclaw.json");

    let (file_token, file_port) = if config_path.exists() {
        let content = fs::read_to_string(&config_path)
            .map_err(|e| format!("failed to read config: {}", e))?;
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

        (token, port)
    } else {
        (None, None)
    };

    // Env vars take precedence
    Ok(OpenClawConfig {
        token: env_token.or(file_token),
        port: env_port.or(file_port).unwrap_or(18789),
    })
}
