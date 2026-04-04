use futures_util::{SinkExt, StreamExt};
use regex::Regex;
use serde::Deserialize;
use serde_json::Value;
use std::sync::LazyLock;
use tokio_tungstenite::{connect_async, tungstenite::Message};

const HTML_MAX_BYTES: usize = 100 * 1024; // 100KB
const CDP_TIMEOUT_SECS: u64 = 30;
const MAX_SCREENSHOT_BASE64: usize = 6_400_000; // ~4.8MB decoded

// ---------- Data types ----------

#[derive(Deserialize, Debug, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub(crate) struct CdpTarget {
    pub id: String,
    #[serde(rename = "type")]
    pub target_type: String,
    pub title: String,
    pub url: String,
    pub web_socket_debugger_url: Option<String>,
}

#[derive(serde::Serialize, Clone, Debug)]
pub struct BrowserPageData {
    pub html: String,
    pub screenshot: String,
    pub url: String,
    pub title: String,
}

// ---------- CDP session (persistent connection) ----------

type WsStream = tokio_tungstenite::WebSocketStream<
    tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
>;

/// A reusable CDP session that keeps a single WebSocket connection open.
/// Use this instead of `cdp_execute` when sending multiple commands to the same target.
pub(crate) struct CdpSession {
    stream: WsStream,
    next_id: u64,
}

impl CdpSession {
    pub async fn connect(ws_url: &str) -> Result<Self, String> {
        let (stream, _) = connect_async(ws_url)
            .await
            .map_err(|e| format!("WebSocket connection failed: {}", e))?;
        Ok(Self {
            stream,
            next_id: 1,
        })
    }

    pub async fn send(&mut self, mut command: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;

        if let Some(obj) = command.as_object_mut() {
            obj.insert("id".to_string(), serde_json::json!(id));
        }

        let text =
            serde_json::to_string(&command).map_err(|e| format!("JSON encode error: {}", e))?;
        self.stream
            .send(Message::Text(text.into()))
            .await
            .map_err(|e| format!("WebSocket send error: {}", e))?;

        let deadline =
            tokio::time::Instant::now() + tokio::time::Duration::from_secs(CDP_TIMEOUT_SECS);

        loop {
            let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
            if remaining.is_zero() {
                return Err("CDP command timed out".to_string());
            }

            match tokio::time::timeout(remaining, self.stream.next()).await {
                Ok(Some(Ok(Message::Text(text)))) => {
                    if let Ok(parsed) = serde_json::from_str::<Value>(&text) {
                        if parsed.get("id").and_then(|v| v.as_u64()) == Some(id) {
                            return Ok(parsed);
                        }
                        // CDP event or unrelated response — skip
                    }
                }
                Ok(Some(Ok(_))) => {} // non-text frame, skip
                Ok(Some(Err(e))) => return Err(format!("WebSocket read error: {}", e)),
                Ok(None) => return Err("WebSocket closed unexpectedly".to_string()),
                Err(_) => return Err("CDP command timed out".to_string()),
            }
        }
    }

    pub async fn close(mut self) {
        let _ = SinkExt::close(&mut self.stream).await;
    }
}

// ---------- CDP WebSocket communication (one-shot) ----------

pub(crate) async fn cdp_execute(ws_url: &str, commands: Vec<Value>) -> Result<Vec<Value>, String> {
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

    // Properly close the WebSocket connection
    let _ = writer.close().await;

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

// ---------- Multi-browser discovery (monitor-aware) ----------

const CDP_PORTS: &[u16] = &[9222, 9223, 9224];

/// Find which monitor contains the given point.
fn monitor_index_for_point(x: i32, y: i32) -> Option<usize> {
    let screens = screenshots::Screen::all().ok()?;
    screens.iter().position(|s| {
        let info = s.display_info;
        x >= info.x
            && x < info.x + info.width as i32
            && y >= info.y
            && y < info.y + info.height as i32
    })
}

/// Window bounds result including minimized state.
struct WindowInfo {
    center: (i32, i32),
    minimized: bool,
}

/// Try to get browser window bounds from a CDP browser-level WebSocket.
async fn get_window_info(browser_ws_url: &str, target_id: &str) -> Option<WindowInfo> {
    let commands = vec![serde_json::json!({
        "method": "Browser.getWindowForTarget",
        "params": { "targetId": target_id }
    })];

    let results = cdp_execute(browser_ws_url, commands).await.ok()?;
    let window_id = results
        .first()?
        .pointer("/result/windowId")?
        .as_i64()?;

    let bounds_commands = vec![serde_json::json!({
        "method": "Browser.getWindowBounds",
        "params": { "windowId": window_id }
    })];

    let bounds_results = cdp_execute(browser_ws_url, bounds_commands).await.ok()?;
    let bounds = bounds_results.first()?.pointer("/result/bounds")?;

    let window_state = bounds
        .get("windowState")
        .and_then(|v| v.as_str())
        .unwrap_or("normal");
    let minimized = window_state == "minimized";

    let left = bounds.get("left")?.as_i64()? as i32;
    let top = bounds.get("top")?.as_i64()? as i32;
    let width = bounds.get("width")?.as_i64()? as i32;
    let height = bounds.get("height")?.as_i64()? as i32;

    Some(WindowInfo {
        center: (left + width / 2, top + height / 2),
        minimized,
    })
}

/// Check which tab is visible (active) by running document.visibilityState via CDP.
/// Uses a short timeout to avoid blocking on broken/unresponsive tabs.
async fn check_tab_visible(ws_url: &str) -> bool {
    let fut = async {
        let commands = vec![serde_json::json!({
            "method": "Runtime.evaluate",
            "params": {
                "expression": "document.visibilityState",
                "returnByValue": true
            }
        })];
        if let Ok(results) = cdp_execute(ws_url, commands).await {
            if let Some(val) = results
                .first()
                .and_then(|r| r.pointer("/result/result/value"))
                .and_then(|v| v.as_str())
            {
                return val == "visible";
            }
        }
        false
    };
    tokio::time::timeout(tokio::time::Duration::from_secs(3), fut)
        .await
        .unwrap_or(false)
}

/// Discover the active tab in the browser on the same monitor as the given point.
/// Prefers visible (active) tabs. Falls back to first available if no match.
pub(crate) async fn discover_tab_near_position(pet_x: i32, pet_y: i32) -> Result<CdpTarget, String> {
    let pet_monitor = monitor_index_for_point(pet_x, pet_y);

    struct Candidate {
        target: CdpTarget,
        monitor: Option<usize>,
        visible: bool,
        minimized: bool,
    }

    let mut candidates: Vec<Candidate> = Vec::new();

    for &port in CDP_PORTS {
        // Try to connect to this port
        let version_url = format!("http://127.0.0.1:{}/json/version", port);
        let version_resp = match reqwest::get(&version_url).await {
            Ok(r) => r,
            Err(_) => continue,
        };
        let version: serde_json::Value = match version_resp.json().await {
            Ok(v) => v,
            Err(_) => continue,
        };
        let browser_ws = match version
            .get("webSocketDebuggerUrl")
            .and_then(|v| v.as_str())
        {
            Some(url) => url.to_string(),
            None => continue,
        };

        // Get ALL page targets (not just the first one)
        let targets_url = format!("http://127.0.0.1:{}/json", port);
        let targets: Vec<CdpTarget> = match reqwest::get(&targets_url).await {
            Ok(r) => match r.json().await {
                Ok(t) => t,
                Err(_) => continue,
            },
            Err(_) => continue,
        };

        let page_targets: Vec<CdpTarget> = targets
            .into_iter()
            .filter(|t| t.target_type == "page" && t.web_socket_debugger_url.is_some())
            .collect();

        if page_targets.is_empty() {
            continue;
        }

        // Check each tab individually: get its own window position, visibility, and minimized state
        for target in page_targets {
            let (tab_monitor, minimized) =
                if let Some(info) = get_window_info(&browser_ws, &target.id).await {
                    let (cx, cy) = info.center;
                    eprintln!(
                        "[browser] Port {} tab \"{}\" window center: ({}, {}), minimized={}",
                        port, target.title, cx, cy, info.minimized
                    );
                    (monitor_index_for_point(cx, cy), info.minimized)
                } else {
                    (None, false)
                };

            let visible = if let Some(ws) = &target.web_socket_debugger_url {
                check_tab_visible(ws).await
            } else {
                false
            };

            eprintln!(
                "[browser] Port {} tab: {} (visible={}, minimized={}, monitor={:?})",
                port, target.title, visible, minimized, tab_monitor
            );

            candidates.push(Candidate {
                target,
                monitor: tab_monitor,
                visible,
                minimized,
            });
        }
    }

    if candidates.is_empty() {
        return Err(
            "No browser with debug mode found. Launch Chrome or Comet with --remote-debugging-port"
                .to_string(),
        );
    }

    // Priority 1: Visible + not minimized + same monitor as ClawPet
    if let Some(pet_mon) = pet_monitor {
        if let Some(matched) = candidates
            .iter()
            .find(|c| c.visible && !c.minimized && c.monitor == Some(pet_mon))
        {
            eprintln!(
                "[browser] Best match: visible tab on monitor {} -> {}",
                pet_mon, matched.target.title
            );
            return Ok(matched.target.clone());
        }
    }

    // Priority 2: Any visible + not minimized tab
    if let Some(matched) = candidates.iter().find(|c| c.visible && !c.minimized) {
        eprintln!(
            "[browser] Using visible non-minimized tab: {}",
            matched.target.title
        );
        return Ok(matched.target.clone());
    }

    // Priority 3: Any non-minimized tab on same monitor
    if let Some(pet_mon) = pet_monitor {
        if let Some(matched) = candidates
            .iter()
            .find(|c| !c.minimized && c.monitor == Some(pet_mon))
        {
            eprintln!(
                "[browser] Using non-minimized tab on monitor {}: {}",
                pet_mon, matched.target.title
            );
            return Ok(matched.target.clone());
        }
    }

    // Priority 4: Any non-minimized tab
    if let Some(matched) = candidates.iter().find(|c| !c.minimized) {
        eprintln!(
            "[browser] Using first non-minimized tab: {}",
            matched.target.title
        );
        return Ok(matched.target.clone());
    }

    // Fallback: first available (even minimized)
    eprintln!("[browser] No non-minimized tab found, using first available");
    Ok(candidates.into_iter().next().unwrap().target)
}

// ---------- Main entry point ----------

pub async fn read_page(pet_x: i32, pet_y: i32) -> Result<BrowserPageData, String> {
    let target = discover_tab_near_position(pet_x, pet_y).await?;
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
