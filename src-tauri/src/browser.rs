use futures_util::{SinkExt, StreamExt};
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::env;
use std::sync::LazyLock;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const DEFAULT_CDP_PORT: u16 = 9222;
const HTML_MAX_BYTES: usize = 100 * 1024; // 100KB
const CDP_TIMEOUT_SECS: u64 = 15;
const MAX_SCREENSHOT_BASE64: usize = 6_400_000; // ~4.8MB decoded

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
        if cfg!(target_os = "macos") {
            "Chrome is not running in debug mode. Restart Chrome with: /Applications/Google\\ Chrome.app/Contents/MacOS/Google\\ Chrome --remote-debugging-port=9222".to_string()
        } else {
            "Chrome is not running in debug mode. Restart Chrome with: chrome.exe --remote-debugging-port=9222".to_string()
        }
    })?;

    let targets: Vec<CdpTarget> = response.json().await.map_err(|e| {
        format!("Failed to parse Chrome debug targets: {}", e)
    })?;

    targets
        .into_iter()
        .find(|t| t.target_type == "page" && t.web_socket_debugger_url.is_some())
        .ok_or_else(|| "No open tabs found in Chrome.".to_string())
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

// ---------- HTML preprocessing (lazy-compiled regexes) ----------

static RE_SCRIPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<script[\s>].*?</script>").unwrap()
});
static RE_STYLE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<style[\s>].*?</style>").unwrap()
});
static RE_SVG: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<svg[\s>].*?</svg>").unwrap()
});
static RE_NOSCRIPT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?is)<noscript[\s>].*?</noscript>").unwrap()
});
static RE_ON_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap()
});
static RE_DATA_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\s+data-[\w-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap()
});
static RE_STYLE_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\s+style\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap()
});
static RE_CLASS_ATTR: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r#"(?i)\s+class\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)"#).unwrap()
});
static RE_WHITESPACE: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"\s+").unwrap()
});

fn preprocess_html(raw: &str) -> String {
    // Rough pre-truncation: skip regex on extremely large HTML (>1MB)
    let input = if raw.len() > 1_024_000 {
        &raw[..raw.floor_char_boundary(1_024_000)]
    } else {
        raw
    };

    let result = RE_SCRIPT.replace_all(input, "");
    let result = RE_STYLE.replace_all(&result, "");
    let result = RE_SVG.replace_all(&result, "");
    let result = RE_NOSCRIPT.replace_all(&result, "");
    let result = RE_ON_ATTR.replace_all(&result, "");
    let result = RE_DATA_ATTR.replace_all(&result, "");
    let result = RE_STYLE_ATTR.replace_all(&result, "");
    let result = RE_CLASS_ATTR.replace_all(&result, "");
    let result = RE_WHITESPACE.replace_all(&result, " ");

    let result = result.trim().to_string();

    if result.len() > HTML_MAX_BYTES {
        let mut end = HTML_MAX_BYTES;
        while end > 0 && !result.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}... [truncated]", &result[..end])
    } else {
        result
    }
}

// ---------- Screenshot compression ----------

fn compress_screenshot_base64(raw_base64: &str) -> Result<String, String> {
    if raw_base64.is_empty() {
        return Ok(String::new());
    }

    // If already within limits, return as-is
    if raw_base64.len() <= MAX_SCREENSHOT_BASE64 {
        return Ok(raw_base64.to_string());
    }

    // Decode base64 → raw JPEG bytes → re-encode at lower quality/size
    use base64::Engine;
    let jpeg_bytes = base64::engine::general_purpose::STANDARD
        .decode(raw_base64)
        .map_err(|e| format!("Failed to decode screenshot: {}", e))?;

    let img = image::load_from_memory_with_format(&jpeg_bytes, image::ImageFormat::Jpeg)
        .map_err(|e| format!("Failed to parse screenshot image: {}", e))?;

    let qualities = [70u8, 60, 50, 40];
    let mut current = img;

    for _ in 0..4 {
        for quality in qualities {
            let mut buf = Vec::new();
            let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
            encoder
                .encode_image(&current)
                .map_err(|e| format!("Failed to re-encode screenshot: {}", e))?;

            let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
            if b64.len() <= MAX_SCREENSHOT_BASE64 {
                return Ok(b64);
            }
        }

        // Downscale by 80%
        let next_w = ((current.width() as f32) * 0.8).round() as u32;
        let next_h = ((current.height() as f32) * 0.8).round() as u32;
        if next_w < 640 || next_h < 360 {
            break;
        }
        current = current.resize(next_w, next_h, image::imageops::FilterType::Triangle);
    }

    Err("Screenshot too large to attach".to_string())
}

// ---------- Main entry point ----------

pub async fn read_page() -> Result<BrowserPageData, String> {
    let target = discover_active_tab().await?;
    let ws_url = target
        .web_socket_debugger_url
        .as_deref()
        .ok_or("No WebSocket URL available for tab")?;

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

    // Check for CDP error responses
    for (i, result) in results.iter().enumerate() {
        if let Some(error) = result.get("error") {
            let msg = error
                .get("message")
                .and_then(|m| m.as_str())
                .unwrap_or("Unknown CDP error");
            eprintln!("[browser-read] CDP command {} error: {}", i, msg);
        }
    }

    eprintln!("[browser-read] CDP commands completed");

    // Extract HTML from results[0]
    let html_raw = results
        .get(0)
        .and_then(|r| r.pointer("/result/result/value"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let html = preprocess_html(html_raw);

    // Extract screenshot base64 from results[1] and compress if needed
    let screenshot_raw = results
        .get(1)
        .and_then(|r| r.pointer("/result/data"))
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let screenshot = compress_screenshot_base64(screenshot_raw)?;

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
        return Err("Failed to read the page. Please try again.".to_string());
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
