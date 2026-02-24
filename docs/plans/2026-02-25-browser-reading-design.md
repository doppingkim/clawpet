# Browser Reading Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable ClawGotchi to read the active Chrome tab's DOM and take a screenshot via Chrome DevTools Protocol (CDP), so users can ask AI questions about what they're viewing.

**Architecture:** Rust backend connects to Chrome's CDP debugging port via WebSocket, extracts DOM HTML + screenshot from the active tab, preprocesses HTML (remove scripts/styles, truncate), and returns both to the React frontend. Frontend shows a browser context indicator and assembles the message with HTML in body + screenshot as image attachment.

**Tech Stack:** Rust (tokio-tungstenite for CDP WebSocket, reqwest for tab discovery HTTP), React/TypeScript frontend, Zustand store, Tauri IPC.

---

### Task 1: Add Rust Dependencies

**Files:**
- Modify: `src-tauri/Cargo.toml`

**Step 1: Add tokio-tungstenite and futures-util to Cargo.toml**

Add under `[dependencies]`:

```toml
tokio-tungstenite = { version = "0.24", features = ["native-tls"] }
futures-util = "0.3"
regex = "1"
```

`reqwest` is already present. `tokio-tungstenite` for CDP WebSocket. `futures-util` for stream handling. `regex` for HTML preprocessing.

**Step 2: Verify it compiles**

Run: `cd /c/clawgotchi/clawgotchi && powershell -File build.ps1 check` or `cargo check` in `src-tauri/`.

Expected: Compiles with no errors (new deps downloaded).

**Step 3: Commit**

```bash
git add src-tauri/Cargo.toml
git commit -m "feat: add tokio-tungstenite, futures-util, regex deps for browser reading"
```

---

### Task 2: Create browser.rs — CDP Tab Discovery

**Files:**
- Create: `src-tauri/src/browser.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod browser;`)

**Step 1: Create browser.rs with tab discovery**

```rust
// src-tauri/src/browser.rs

use serde::{Deserialize, Serialize};

const DEFAULT_CDP_PORT: u16 = 9222;

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct CdpTarget {
    id: String,
    #[serde(rename = "type")]
    target_type: String,
    title: String,
    url: String,
    web_socket_debugger_url: Option<String>,
}

#[derive(Serialize)]
pub struct BrowserPageData {
    pub html: String,
    pub screenshot: String, // base64 JPEG
    pub url: String,
    pub title: String,
}

fn get_cdp_port() -> u16 {
    std::env::var("CLAWGOTCHI_CDP_PORT")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_CDP_PORT)
}

async fn discover_active_tab() -> Result<CdpTarget, String> {
    let port = get_cdp_port();
    let url = format!("http://127.0.0.1:{}/json", port);

    let response = reqwest::get(&url)
        .await
        .map_err(|_| "Chrome이 디버깅 모드로 실행되지 않았어요. chrome.exe --remote-debugging-port=9222 로 Chrome을 다시 시작해주세요!".to_string())?;

    let targets: Vec<CdpTarget> = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse Chrome targets: {e}"))?;

    targets
        .into_iter()
        .find(|t| t.target_type == "page" && t.web_socket_debugger_url.is_some())
        .ok_or_else(|| "Chrome에 열린 탭이 없어요.".to_string())
}
```

**Step 2: Register module in lib.rs**

At top of `src-tauri/src/lib.rs`, add:

```rust
mod browser;
```

**Step 3: Verify it compiles**

Run: `cargo check` in `src-tauri/`.

Expected: Compiles (unused warnings are OK at this stage).

**Step 4: Commit**

```bash
git add src-tauri/src/browser.rs src-tauri/src/lib.rs
git commit -m "feat: add browser.rs with CDP tab discovery"
```

---

### Task 3: CDP WebSocket Communication

**Files:**
- Modify: `src-tauri/src/browser.rs`

**Step 1: Add CDP command execution via WebSocket**

Add to `browser.rs`:

```rust
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio_tungstenite::connect_async;

static CDP_MSG_ID: AtomicU64 = AtomicU64::new(1);

async fn cdp_execute(ws_url: &str, commands: Vec<Value>) -> Result<Vec<Value>, String> {
    let (ws_stream, _) = connect_async(ws_url)
        .await
        .map_err(|e| format!("CDP WebSocket connection failed: {e}"))?;

    let (mut write, mut read) = ws_stream.split();

    // Assign IDs and send all commands
    let mut ids: Vec<u64> = Vec::new();
    for mut cmd in commands {
        let id = CDP_MSG_ID.fetch_add(1, Ordering::Relaxed);
        cmd.as_object_mut().unwrap().insert("id".to_string(), json!(id));
        ids.push(id);

        let msg = tokio_tungstenite::tungstenite::Message::Text(cmd.to_string());
        write.send(msg).await.map_err(|e| format!("CDP send failed: {e}"))?;
    }

    // Collect responses for our IDs
    let mut results: std::collections::HashMap<u64, Value> = std::collections::HashMap::new();
    let expected = ids.len();

    let timeout = tokio::time::Duration::from_secs(15);
    let deadline = tokio::time::Instant::now() + timeout;

    while results.len() < expected {
        let remaining = deadline.saturating_duration_since(tokio::time::Instant::now());
        if remaining.is_zero() {
            return Err("CDP response timeout".to_string());
        }

        match tokio::time::timeout(remaining, read.next()).await {
            Ok(Some(Ok(msg))) => {
                if let tokio_tungstenite::tungstenite::Message::Text(text) = msg {
                    if let Ok(val) = serde_json::from_str::<Value>(&text) {
                        if let Some(id) = val.get("id").and_then(|v| v.as_u64()) {
                            if ids.contains(&id) {
                                results.insert(id, val);
                            }
                        }
                    }
                }
            }
            Ok(Some(Err(e))) => return Err(format!("CDP read error: {e}")),
            Ok(None) => return Err("CDP connection closed unexpectedly".to_string()),
            Err(_) => return Err("CDP response timeout".to_string()),
        }
    }

    // Return results in original order
    Ok(ids.iter().map(|id| results.remove(id).unwrap()).collect())
}
```

**Step 2: Verify it compiles**

Run: `cargo check` in `src-tauri/`.

**Step 3: Commit**

```bash
git add src-tauri/src/browser.rs
git commit -m "feat: add CDP WebSocket command execution"
```

---

### Task 4: HTML Preprocessing

**Files:**
- Modify: `src-tauri/src/browser.rs`

**Step 1: Add HTML cleaning function**

Add to `browser.rs`:

```rust
use regex::Regex;

const MAX_HTML_BYTES: usize = 100 * 1024; // 100KB

fn preprocess_html(raw: &str) -> String {
    // Remove <script>...</script> and <style>...</style> (case insensitive, dotall)
    let re_script = Regex::new(r"(?is)<script[\s>].*?</script>").unwrap();
    let re_style = Regex::new(r"(?is)<style[\s>].*?</style>").unwrap();
    let re_svg = Regex::new(r"(?is)<svg[\s>].*?</svg>").unwrap();
    let re_noscript = Regex::new(r"(?is)<noscript[\s>].*?</noscript>").unwrap();

    let cleaned = re_script.replace_all(raw, "");
    let cleaned = re_style.replace_all(&cleaned, "");
    let cleaned = re_svg.replace_all(&cleaned, "");
    let cleaned = re_noscript.replace_all(&cleaned, "");

    // Remove event handler attributes (on*)
    let re_event_attrs = Regex::new(r#"(?i)\s+on\w+\s*=\s*"[^"]*""#).unwrap();
    let cleaned = re_event_attrs.replace_all(&cleaned, "");
    let re_event_attrs_sq = Regex::new(r#"(?i)\s+on\w+\s*=\s*'[^']*'"#).unwrap();
    let cleaned = re_event_attrs_sq.replace_all(&cleaned, "");

    // Remove data-* attributes
    let re_data_attrs = Regex::new(r#"(?i)\s+data-[\w-]+\s*=\s*"[^"]*""#).unwrap();
    let cleaned = re_data_attrs.replace_all(&cleaned, "");
    let re_data_attrs_sq = Regex::new(r#"(?i)\s+data-[\w-]+\s*=\s*'[^']*'"#).unwrap();
    let cleaned = re_data_attrs_sq.replace_all(&cleaned, "");

    // Remove inline style attributes
    let re_style_attr = Regex::new(r#"(?i)\s+style\s*=\s*"[^"]*""#).unwrap();
    let cleaned = re_style_attr.replace_all(&cleaned, "");

    // Remove class attributes (often very long with tailwind/css-modules)
    let re_class_attr = Regex::new(r#"(?i)\s+class\s*=\s*"[^"]*""#).unwrap();
    let cleaned = re_class_attr.replace_all(&cleaned, "");

    // Collapse whitespace: multiple spaces/newlines → single space
    let re_whitespace = Regex::new(r"\s{2,}").unwrap();
    let cleaned = re_whitespace.replace_all(&cleaned, " ");

    // Truncate to MAX_HTML_BYTES
    let result = cleaned.to_string();
    if result.len() > MAX_HTML_BYTES {
        // Truncate at a safe boundary (don't break UTF-8)
        let mut end = MAX_HTML_BYTES;
        while end > 0 && !result.is_char_boundary(end) {
            end -= 1;
        }
        format!("{}... [truncated]", &result[..end])
    } else {
        result
    }
}
```

**Step 2: Verify it compiles**

Run: `cargo check` in `src-tauri/`.

**Step 3: Commit**

```bash
git add src-tauri/src/browser.rs
git commit -m "feat: add HTML preprocessing for browser reading"
```

---

### Task 5: Main read_browser_page Function + Tauri Command

**Files:**
- Modify: `src-tauri/src/browser.rs`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add the public read_browser_page function in browser.rs**

Add to `browser.rs`:

```rust
pub async fn read_page() -> Result<BrowserPageData, String> {
    // 1. Discover active tab
    let tab = discover_active_tab().await?;
    let ws_url = tab.web_socket_debugger_url
        .ok_or("No WebSocket URL for tab")?;

    // 2. Send CDP commands (HTML + screenshot + metadata)
    let commands = vec![
        json!({
            "method": "Runtime.evaluate",
            "params": { "expression": "document.documentElement.outerHTML", "returnByValue": true }
        }),
        json!({
            "method": "Page.captureScreenshot",
            "params": { "format": "jpeg", "quality": 80 }
        }),
        json!({
            "method": "Runtime.evaluate",
            "params": {
                "expression": "JSON.stringify({url:location.href,title:document.title})",
                "returnByValue": true
            }
        }),
    ];

    let results = cdp_execute(&ws_url, commands).await?;

    // 3. Extract HTML
    let raw_html = results[0]
        .pointer("/result/result/value")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let html = preprocess_html(&raw_html);

    // 4. Extract screenshot (already base64 from CDP)
    let screenshot = results[1]
        .pointer("/result/data")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    // 5. Extract metadata
    let meta_json = results[2]
        .pointer("/result/result/value")
        .and_then(|v| v.as_str())
        .unwrap_or("{}");
    let meta: Value = serde_json::from_str(meta_json).unwrap_or(json!({}));
    let url = meta.get("url").and_then(|v| v.as_str()).unwrap_or(&tab.url).to_string();
    let title = meta.get("title").and_then(|v| v.as_str()).unwrap_or(&tab.title).to_string();

    if html.is_empty() && screenshot.is_empty() {
        return Err("페이지를 읽는 중 오류가 발생했어요. 다시 시도해주세요.".to_string());
    }

    Ok(BrowserPageData {
        html,
        screenshot,
        url,
        title,
    })
}
```

**Step 2: Add Tauri command in lib.rs**

Add the command function in `lib.rs` (before the `run()` function):

```rust
#[tauri::command]
async fn read_browser_page() -> Result<browser::BrowserPageData, String> {
    browser::read_page().await
}
```

**Step 3: Register the command in the invoke_handler**

In `lib.rs`, update the `invoke_handler` macro call:

```rust
.invoke_handler(tauri::generate_handler![
    config_reader::read_openclaw_config,
    config_reader::read_openclaw_identity,
    fetch_image_url,
    read_image_file,
    capture_screen_region,
    list_capture_displays,
    capture_screen_display,
    capture_screen_for_point,
    read_browser_page
])
```

**Step 4: Verify it compiles**

Run: `cargo check` in `src-tauri/`.

Expected: Compiles successfully.

**Step 5: Commit**

```bash
git add src-tauri/src/browser.rs src-tauri/src/lib.rs
git commit -m "feat: add read_browser_page Tauri command with CDP integration"
```

---

### Task 6: Update CSP for CDP HTTP

**Files:**
- Modify: `src-tauri/tauri.conf.json`

**Step 1: Add CDP localhost to CSP connect-src**

The CSP already allows `http://ipc.localhost` and `ws://127.0.0.1:*`. Since CDP HTTP calls happen from Rust (not browser), no CSP change is actually needed. The `reqwest` and `tokio-tungstenite` calls bypass the webview CSP entirely.

**This task is a no-op.** Skip to next task.

---

### Task 7: Add browserContext to Zustand Store

**Files:**
- Modify: `src/store/useStore.ts`

**Step 1: Add BrowserContext type and state**

Add the type above the `ClawPetState` interface:

```typescript
export type BrowserContext = {
  html: string;
  screenshot: string; // base64 JPEG (no data URL prefix)
  url: string;
  title: string;
};
```

Add to the `ClawPetState` interface:

```typescript
// Browser context
browserContext: BrowserContext | null;

// Actions (add to existing actions section)
setBrowserContext: (ctx: BrowserContext) => void;
clearBrowserContext: () => void;
```

Add to the `create` implementation:

```typescript
// Browser context
browserContext: null,

setBrowserContext: (ctx) => set({ browserContext: ctx }),
clearBrowserContext: () => set({ browserContext: null }),
```

**Step 2: Verify no TypeScript errors**

Run: `cd /c/clawgotchi/clawgotchi && npx tsc --noEmit`

**Step 3: Commit**

```bash
git add src/store/useStore.ts
git commit -m "feat: add browserContext state to Zustand store"
```

---

### Task 8: Add "Read browser page" Menu Item to Character.tsx

**Files:**
- Modify: `src/components/Character.tsx`

**Step 1: Update ActionId type and MENU_ACTIONS**

Change the `ActionId` type:

```typescript
type ActionId = "capture-area" | "capture-display" | "read-browser" | "history";
```

Update `MENU_ACTIONS`:

```typescript
const MENU_ACTIONS: Array<{ id: ActionId; label: string }> = [
  { id: "capture-area", label: "Area capture" },
  { id: "capture-display", label: "Full screen capture" },
  { id: "read-browser", label: "Read browser page" },
  { id: "history", label: "Conversation history" },
];
```

**Step 2: Add ActionIcon for read-browser**

Add a new case in the `ActionIcon` component (before the final `return`):

```typescript
if (action === "read-browser") {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="1" y="1" width="14" height="14" rx="2" />
      <rect x="2" y="2" width="12" height="12" rx="1" />
      <rect x="1" y="4" width="14" height="1" />
      <circle cx="3" cy="2.5" r="0.7" />
      <circle cx="5" cy="2.5" r="0.7" />
      <circle cx="7" cy="2.5" r="0.7" />
    </svg>
  );
}
```

**Step 3: Add read-browser handler in handleActionClick**

Add to `handleActionClick`, before the `history` case:

```typescript
if (action === "read-browser") {
  showSpeechBubble("Reading browser...");
  try {
    const result = await invoke<{
      html: string;
      screenshot: string;
      url: string;
      title: string;
    }>("read_browser_page");
    setBrowserContext(result);
    setAttachedImage({
      dataUrl: `data:image/jpeg;base64,${result.screenshot}`,
      mimeType: "image/jpeg",
    });
    hideSpeechBubble();
    showChatInput();
  } catch (err) {
    showSpeechBubble(String(err));
  }
  return;
}
```

**Step 4: Wire up store actions**

Add to the destructured store values at the top of the `Character` component:

```typescript
const setBrowserContext = useStore((s) => s.setBrowserContext);
const hideSpeechBubble = useStore((s) => s.hideSpeechBubble);
```

Add `setBrowserContext` and `hideSpeechBubble` to the `handleActionClick` dependency array.

**Step 5: Verify no TypeScript errors**

Run: `npx tsc --noEmit`

**Step 6: Commit**

```bash
git add src/components/Character.tsx
git commit -m "feat: add 'Read browser page' menu item with CDP invoke"
```

---

### Task 9: Update ChatInput to Handle Browser Context

**Files:**
- Modify: `src/components/ChatInput.tsx`

**Step 1: Read browserContext from store**

Add to the store selectors at the top of `ChatInput`:

```typescript
const browserContext = useStore((s) => s.browserContext);
const clearBrowserContext = useStore((s) => s.clearBrowserContext);
```

**Step 2: Modify handleSubmit to include browser context in message**

In the `handleSubmit` callback, modify the message construction. Replace the section where `params` is built:

```typescript
const hasBrowser = !!browserContext;

// Build message text
let messageText = trimmed || (hasImage ? "What's in this image?" : "");
if (hasBrowser) {
  const parts: string[] = [];
  parts.push(`[Browsing: ${browserContext.url}]`);
  parts.push(`Title: ${browserContext.title}`);
  parts.push("");
  parts.push("```html");
  parts.push(browserContext.html);
  parts.push("```");
  parts.push("");
  parts.push(trimmed || "이 페이지에 대해 설명해줘");
  messageText = parts.join("\n");
}

const outgoingText = trimmed || (hasImage ? "[Image attachment]" : hasBrowser ? "[Browser page]" : "");
appendLocalChatHistory("user", outgoingText);

const params: Record<string, unknown> = {
  sessionKey,
  message: messageText,
  deliver: false,
  idempotencyKey: runId,
};
```

**Step 3: Update image attachment section to handle browser screenshot**

The existing `hasImage` block already handles the attached image (which now contains the browser screenshot). After the image attachment is sent, clear browser context too:

```typescript
if (hasImage) {
  const base64Data = attachedImage.dataUrl.split(",")[1] ?? "";
  if (base64Data) {
    params.attachments = [
      { type: "image", mimeType: attachedImage.mimeType, content: base64Data },
    ];
  }
  clearAttachedImage();
}
if (hasBrowser) {
  clearBrowserContext();
}
```

**Step 4: Update the placeholder text**

Change the `placeholder` attribute of the input:

```typescript
placeholder={
  browserContext
    ? "Ask about this page... (Enter to send)"
    : attachedImage
    ? "Add a question... (Enter to send)"
    : "Ask me anything..."
}
```

**Step 5: Add browser context indicator in the preview area**

Add a browser context indicator above the image preview:

```typescript
{browserContext && (
  <div className="chat-browser-context">
    <span className="chat-browser-url">{browserContext.title || browserContext.url}</span>
    <button className="chat-image-remove" onClick={() => { clearBrowserContext(); clearAttachedImage(); }} title="Remove browser context">
      x
    </button>
  </div>
)}
```

**Step 6: Update handleKeyDown Escape to also clear browser context**

```typescript
} else if (e.key === "Escape") {
  clearAttachedImage();
  clearBrowserContext();
  if (inputRef.current) inputRef.current.value = "";
  hideChatInput();
}
```

**Step 7: Add `clearBrowserContext` and `browserContext` to relevant dependency arrays**

Add `browserContext` and `clearBrowserContext` to `handleSubmit`'s dependency array.

**Step 8: Verify no TypeScript errors**

Run: `npx tsc --noEmit`

**Step 9: Commit**

```bash
git add src/components/ChatInput.tsx
git commit -m "feat: integrate browser context into ChatInput message assembly"
```

---

### Task 10: Add CSS for Browser Context Indicator

**Files:**
- Modify: `src/components/ChatInput.css`

**Step 1: Add browser context styles**

Append to `ChatInput.css`:

```css
.chat-browser-context {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  background: rgba(59, 130, 246, 0.15);
  border-radius: 6px;
  margin-bottom: 4px;
}

.chat-browser-url {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
```

**Step 2: Commit**

```bash
git add src/components/ChatInput.css
git commit -m "feat: add CSS for browser context indicator"
```

---

### Task 11: Manual Integration Test

**Files:** None (testing only)

**Step 1: Start Chrome with debugging port**

Open a terminal and run:
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```

Navigate to any web page (e.g., https://developer.mozilla.org).

**Step 2: Start ClawGotchi in dev mode**

```bash
cd /c/clawgotchi/clawgotchi && pnpm tauri dev
```

**Step 3: Test the flow**

1. Right-click the ClawGotchi character
2. Click "Read browser page"
3. Verify: speech bubble shows "Reading browser..." briefly
4. Verify: ChatInput opens with page title shown and screenshot thumbnail
5. Type a question and press Enter
6. Verify: AI responds about the page content

**Step 4: Test error case**

1. Close Chrome (or start without debug port)
2. Right-click → "Read browser page"
3. Verify: speech bubble shows Korean error message about debugging mode

**Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: browser reading feature complete — CDP integration with DOM + screenshot"
```
