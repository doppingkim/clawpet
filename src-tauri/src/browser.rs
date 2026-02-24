use futures_util::{SinkExt, StreamExt};
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::env;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const DEFAULT_CDP_PORT: u16 = 9222;
const HTML_MAX_BYTES: usize = 100 * 1024; // 100KB
const CDP_TIMEOUT_SECS: u64 = 15;

// ---------- Data types ----------

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct CdpTarget {
    id: String,
    #[serde(rename = "type")]
    target_type: String,
    title: String,
    url: String,
    web_socket_debugger_url: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct BrowserPageData {
    pub html: String,
    pub screenshot: String,
    pub url: String,
    pub title: String,
}

// ---------- CDP port ----------

fn get_cdp_port() -> u16 {
    env::var("CLAWGOTCHI_CDP_PORT")
        .ok()
        .and_then(|p| p.parse::<u16>().ok())
        .unwrap_or(DEFAULT_CDP_PORT)
}

// ---------- Tab discovery ----------

async fn discover_active_tab() -> Result<CdpTarget, String> {
    let port = get_cdp_port();
    let url = format!("http://127.0.0.1:{}/json", port);

    let response = reqwest::get(&url).await.map_err(|_| {
        "Chrome이 디버깅 모드로 실행되지 않았어요. chrome.exe --remote-debugging-port=9222 로 Chrome을 다시 시작해주세요!".to_string()
    })?;

    let targets: Vec<CdpTarget> = response.json().await.map_err(|e| {
        format!("Failed to parse Chrome debug targets: {}", e)
    })?;

    targets
        .into_iter()
        .find(|t| t.target_type == "page" && t.web_socket_debugger_url.is_some())
        .ok_or_else(|| "Chrome에 열린 탭이 없어요.".to_string())
}

// ---------- CDP WebSocket communication ----------

async fn cdp_execute(ws_url: &str, commands: Vec<Value>) -> Result<Vec<Value>, String> {
    let (ws_stream, _) = connect_async(ws_url)
        .await
        .map_err(|e| format!("WebSocket connection failed: {}", e))?;

    let (mut writer, mut reader) = ws_stream.split();

    // Assign unique IDs and send all commands
    let mut ids: Vec<u64> = Vec::with_capacity(commands.len());
    for (i, mut cmd) in commands.into_iter().enumerate() {
        let id = (i + 1) as u64;
        ids.push(id);
        if let Some(obj) = cmd.as_object_mut() {
            obj.insert("id".to_string(), serde_json::json!(id));
        }
        let text = serde_json::to_string(&cmd).map_err(|e| format!("JSON encode error: {}", e))?;
        writer
            .send(Message::Text(text.into()))
            .await
            .map_err(|e| format!("WebSocket send error: {}", e))?;
    }

    // Collect responses matching our IDs
    let expected_count = ids.len();
    let mut results: Vec<Option<Value>> = vec![None; expected_count];
    let mut collected = 0usize;

    let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(CDP_TIMEOUT_SECS);

    loop {
        if collected >= expected_count {
            break;
        }

        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("CDP command timed out".to_string());
        }

        let msg = tokio::time::timeout(remaining, reader.next()).await;

        match msg {
            Ok(Some(Ok(Message::Text(text)))) => {
                if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                    if let Some(msg_id) = parsed.get("id").and_then(|v| v.as_u64()) {
                        if let Some(idx) = ids.iter().position(|&id| id == msg_id) {
                            if results[idx].is_none() {
                                results[idx] = Some(parsed);
                                collected += 1;
                            }
                        }
                    }
                }
            }
            Ok(Some(Ok(_))) => {
                // Non-text message, skip
            }
            Ok(Some(Err(e))) => {
                return Err(format!("WebSocket read error: {}", e));
            }
            Ok(None) => {
                return Err("WebSocket closed unexpectedly".to_string());
            }
            Err(_) => {
                return Err("CDP command timed out".to_string());
            }
        }
    }

    // Return results in order, replacing None with null
    Ok(results
        .into_iter()
        .map(|r| r.unwrap_or(Value::Null))
        .collect())
}

// ---------- HTML preprocessing ----------

fn preprocess_html(raw: &str) -> String {
    // Remove <script>...</script> tags with content
    let re_script = Regex::new(r"(?is)<script[\s>].*?</script>").unwrap();
    let result = re_script.replace_all(raw, "");

    // Remove <style>...</style> tags with content
    let re_style = Regex::new(r"(?is)<style[\s>].*?</style>").unwrap();
    let result = re_style.replace_all(&result, "");

    // Remove <svg>...</svg> tags with content
    let re_svg = Regex::new(r"(?is)<svg[\s>].*?</svg>").unwrap();
    let result = re_svg.replace_all(&result, "");

    // Remove <noscript>...</noscript> tags with content
    let re_noscript = Regex::new(r"(?is)<noscript[\s>].*?</noscript>").unwrap();
    let result = re_noscript.replace_all(&result, "");

    // Remove event handler attributes (on*)
    let re_on = Regex::new(r#"(?i)\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap();
    let result = re_on.replace_all(&result, "");

    // Remove data-* attributes
    let re_data = Regex::new(r#"(?i)\s+data-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap();
    let result = re_data.replace_all(&result, "");

    // Remove inline style attributes
    let re_inline_style =
        Regex::new(r#"(?i)\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap();
    let result = re_inline_style.replace_all(&result, "");

    // Remove class attributes
    let re_class = Regex::new(r#"(?i)\s+class\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap();
    let result = re_class.replace_all(&result, "");

    // Collapse whitespace (multiple spaces/newlines -> single space)
    let re_ws = Regex::new(r"\s+").unwrap();
    let result = re_ws.replace_all(&result, " ");

    let result = result.trim().to_string();

    // Truncate to 100KB at a char boundary
    if result.len() > HTML_MAX_BYTES {
        let mut end = HTML_MAX_BYTES;
        while end > 0 && !result.is_char_boundary(end) {
            end -= 1;
        }
        result[..end].to_string()
    } else {
        result
    }
}

// ---------- Main entry point ----------

pub async fn read_page() -> Result<BrowserPageData, String> {
    let target = discover_active_tab().await?;
    let ws_url = target.web_socket_debugger_url.as_deref().unwrap();

    let commands = vec![
        // 0: Get page HTML
        serde_json::json!({
            "method": "Runtime.evaluate",
            "params": {
                "expression": "document.documentElement.outerHTML",
                "returnByValue": true
            }
        }),
        // 1: Capture screenshot
        serde_json::json!({
            "method": "Page.captureScreenshot",
            "params": {
                "format": "jpeg",
                "quality": 80
            }
        }),
        // 2: Get url and title
        serde_json::json!({
            "method": "Runtime.evaluate",
            "params": {
                "expression": "JSON.stringify({url:location.href,title:document.title})",
                "returnByValue": true
            }
        }),
    ];

    eprintln!("[browser-read] Connecting to tab: {} - {}", target.title, target.url);

    let results = cdp_execute(ws_url, commands).await?;

    eprintln!("[browser-read] CDP commands completed");

    // Extract HTML from results[0]
    let html_raw = results
        .get(0)
        .and_then(|r| r.pointer("/result/result/value"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let html = preprocess_html(html_raw);

    // Extract screenshot base64 from results[1]
    let screenshot = results
        .get(1)
        .and_then(|r| r.pointer("/result/data"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Extract url and title from results[2]
    let meta_json_str = results
        .get(2)
        .and_then(|r| r.pointer("/result/result/value"))
        .and_then(|v| v.as_str())
        .unwrap_or("{}");

    let meta: Value = serde_json::from_str(meta_json_str).unwrap_or(serde_json::json!({}));
    let url = meta
        .get("url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let title = meta
        .get("title")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // Error if both html and screenshot are empty
    if html.is_empty() && screenshot.is_empty() {
        return Err(
            "페이지를 읽는 중 오류가 발생했어요. 다시 시도해주세요.".to_string(),
        );
    }

    eprintln!("[browser-read] Result:");
    eprintln!("  URL: {}", url);
    eprintln!("  Title: {}", title);
    eprintln!("  HTML: {} bytes (raw {} bytes)", html.len(), html_raw.len());
    eprintln!("  Screenshot: {} bytes base64", screenshot.len());

    Ok(BrowserPageData {
        html,
        screenshot,
        url,
        title,
    })
}
