use crate::browser;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::LazyLock;

const EXTRACTION_JS: &str = include_str!("extract_page.js");

static RE_IMG_PLACEHOLDER: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"\{\{IMG:\d+\}\}").unwrap());

fn obsidian_base_dir() -> Result<PathBuf, String> {
    std::env::var("CLAWPET_OBSIDIAN_BASE")
        .map(PathBuf::from)
        .map_err(|_| "CLAWPET_OBSIDIAN_BASE is not set. Set it to your Obsidian vault markdown folder (e.g. /Users/you/obsidian/vault/Resources).".to_string())
}

fn obsidian_img_dir() -> Result<PathBuf, String> {
    std::env::var("CLAWPET_OBSIDIAN_IMG_DIR")
        .map(PathBuf::from)
        .map_err(|_| "CLAWPET_OBSIDIAN_IMG_DIR is not set. Set it to your Obsidian vault image folder (e.g. /Users/you/obsidian/vault/Resources/images).".to_string())
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
struct ExtractedPage {
    page_type: String,
    url: String,
    title: String,
    author: String,
    author_handle: String,
    date: String,
    content: String,
    images: Vec<String>,
    text_hints: String,
    clip_date: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ClipResult {
    pub saved_path: String,
    pub category: String,
    pub title: String,
    pub image_count: usize,
}

// ---------- Categorization ----------

fn categorize(hints: &str) -> &'static str {
    let coding = [
        "code", "coding", "programming", "developer", "software", "engineer",
        "api", "github", "javascript", "typescript", "python", "rust", "react",
        "algorithm", "database", "framework", "npm", "git", "deploy",
        "frontend", "backend", "fullstack", "devops", "docker", "kubernetes",
        "개발", "코딩", "프로그래밍", "알고리즘", "프레임워크",
        "bug", "debug", "compile", "syntax", "refactor",
        "html", "css", "node", "webpack", "vite",
        "ai", "ml", "llm", "gpt", "claude", "openai", "anthropic",
        "prompt", "embedding", "transformer", "neural",
        "open source", "오픈소스", "linux", "server", "서버",
    ];
    let markets = [
        "stock", "market", "economy", "finance", "trading", "investment",
        "nasdaq", "s&p", "dow", "bitcoin", "crypto", "btc", "eth",
        "inflation", "fed", "interest rate", "bond", "yield", "dividend",
        "earnings", "revenue", "ipo", "etf", "forex", "commodity",
        "bull", "bear", "rally", "crash", "volatility",
        "주식", "시장", "경제", "투자", "금융", "금리", "환율", "채권",
        "배당", "수익률", "매수", "매도", "상승", "하락",
        "코인", "비트코인", "이더리움", "나스닥", "코스피", "코스닥",
        "부동산", "금값", "유가", "원자재", "펀드", "연금",
        "테슬라", "엔비디아", "애플", "삼성", "반도체",
    ];

    let c: usize = coding.iter().filter(|k| hints.contains(*k)).count();
    let m: usize = markets.iter().filter(|k| hints.contains(*k)).count();

    if m > c { "markets" } else { "coding" }
}

// ---------- Filename helpers ----------

fn is_cjk_or_hangul(c: char) -> bool {
    let cp = c as u32;
    // CJK Unified Ideographs, Hangul Syllables, Hangul Jamo, Katakana, Hiragana
    (0x3000..=0x9FFF).contains(&cp)
        || (0xAC00..=0xD7AF).contains(&cp)
        || (0x1100..=0x11FF).contains(&cp)
        || (0xF900..=0xFAFF).contains(&cp)
}

fn slugify(text: &str) -> String {
    let mut result = String::new();
    let mut last_was_sep = false;

    for c in text.chars().take(50) {
        if c.is_ascii_alphanumeric() {
            result.push(c);
            last_was_sep = false;
        } else if is_cjk_or_hangul(c) {
            result.push(c);
            last_was_sep = false;
        } else if !last_was_sep && !result.is_empty() {
            result.push('-');
            last_was_sep = true;
        }
    }

    result.trim_matches('-').to_string()
}

fn format_date(iso: &str) -> String {
    if iso.len() >= 10 && iso.is_char_boundary(10) {
        iso[..10].to_string()
    } else {
        String::new()
    }
}

fn extract_domain(url: &str) -> String {
    url.split("//")
        .nth(1)
        .unwrap_or(url)
        .split('/')
        .next()
        .unwrap_or("unknown")
        .trim_start_matches("www.")
        .to_string()
}

fn generate_base_name(page: &ExtractedPage) -> String {
    let date = format_date(if !page.date.is_empty() {
        &page.date
    } else {
        &page.clip_date
    });

    let title_part = match page.page_type.as_str() {
        "x_post" | "x_thread" => {
            let handle = page.author_handle.trim_start_matches('@');
            let preview: String = page
                .content
                .chars()
                .take(40)
                .collect::<String>()
                .split_whitespace()
                .take(5)
                .collect::<Vec<_>>()
                .join(" ");
            if !handle.is_empty() {
                format!("{}-{}", handle, preview)
            } else {
                preview
            }
        }
        _ => {
            if !page.title.is_empty() {
                page.title.clone()
            } else {
                "untitled".to_string()
            }
        }
    };

    let slug = slugify(&title_part);
    if date.is_empty() {
        slug
    } else {
        format!("{}-{}", date, slug)
    }
}

fn unique_path(folder: &PathBuf, name: &str, ext: &str) -> PathBuf {
    let candidate = folder.join(format!("{}.{}", name, ext));
    if !candidate.exists() {
        return candidate;
    }
    for i in 2..=99 {
        let candidate = folder.join(format!("{}-{}.{}", name, i, ext));
        if !candidate.exists() {
            return candidate;
        }
    }
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    folder.join(format!("{}-{}.{}", name, ts, ext))
}

// ---------- Image downloading + compression ----------

fn compress_to_jpeg(raw_bytes: &[u8], quality: u8) -> Result<Vec<u8>, String> {
    let img = image::load_from_memory(raw_bytes)
        .map_err(|e| format!("Failed to decode image: {}", e))?;

    let mut buf = Vec::new();
    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut buf, quality);
    encoder
        .encode_image(&img)
        .map_err(|e| format!("Failed to compress image: {}", e))?;

    Ok(buf)
}

fn is_safe_image_url(url: &str) -> bool {
    let Ok(parsed) = url::Url::parse(url) else {
        return false;
    };
    let scheme = parsed.scheme();
    if scheme != "http" && scheme != "https" {
        return false;
    }
    if let Some(host) = parsed.host_str() {
        let lower = host.to_lowercase();
        if lower == "localhost"
            || lower == "127.0.0.1"
            || lower == "[::1]"
            || lower.ends_with(".local")
            || lower.starts_with("10.")
            || lower.starts_with("192.168.")
            || lower.starts_with("169.254.")
            || lower.starts_with("fd")
            || lower.starts_with("fe80")
            || (lower.starts_with("172.") && {
                lower
                    .split('.')
                    .nth(1)
                    .and_then(|s| s.parse::<u8>().ok())
                    .map_or(false, |n| (16..=31).contains(&n))
            })
        {
            return false;
        }
    }
    true
}

async fn download_image(url: &str) -> Result<(Vec<u8>, String), String> {
    if !is_safe_image_url(url) {
        return Err(format!("URL not allowed: {}", url));
    }

    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .build()
        .map_err(|e| e.to_string())?;

    let resp = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Download failed: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }

    let bytes = resp
        .bytes()
        .await
        .map_err(|e| format!("Download read error: {}", e))?;

    let raw = bytes.to_vec();
    let original_size = raw.len();

    // Compress to JPEG 80% quality (significant size reduction)
    match compress_to_jpeg(&raw, 80) {
        Ok(compressed) => {
            eprintln!(
                "[obsidian-clip] Image compressed: {} -> {} bytes ({}%)",
                original_size,
                compressed.len(),
                (compressed.len() as f64 / original_size as f64 * 100.0) as u32
            );
            Ok((compressed, "jpg".to_string()))
        }
        Err(_) => {
            // If compression fails, save original with detected extension
            let ext = if raw.len() >= 4 && raw[..4] == [0x89, 0x50, 0x4E, 0x47] {
                "png"
            } else if raw.len() >= 4 && &raw[..4] == b"RIFF" {
                "webp"
            } else if raw.len() >= 3 && raw[..3] == [0xFF, 0xD8, 0xFF] {
                "jpg"
            } else if raw.len() >= 4 && &raw[..4] == b"GIF8" {
                "gif"
            } else {
                "jpg"
            };
            Ok((raw, ext.to_string()))
        }
    }
}

// ---------- Markdown formatting ----------

/// Replace {{IMG:N}} placeholders in content with ![[filename]] references.
/// Returns the content with placeholders resolved, and whether any were found.
fn resolve_image_placeholders(content: &str, image_filenames: &[String]) -> (String, bool) {
    let mut result = content.to_string();
    let mut found_any = false;

    for (i, filename) in image_filenames.iter().enumerate() {
        let placeholder = format!("{{{{IMG:{}}}}}", i);
        if result.contains(&placeholder) {
            result = result.replace(&placeholder, &format!("![[{}]]", filename));
            found_any = true;
        }
    }

    // Also resolve any remaining placeholders for images that failed to download
    result = RE_IMG_PLACEHOLDER.replace_all(&result, "").to_string();

    (result, found_any)
}

fn format_markdown(page: &ExtractedPage, category: &str, image_filenames: &[String]) -> String {
    let mut md = String::new();
    let domain = extract_domain(&page.url);
    let date = format_date(&page.date);
    let clip_date = &page.clip_date;

    // --- Frontmatter ---
    md.push_str("---\n");
    md.push_str(&format!("source: {}\n", domain));
    if !page.author.is_empty() {
        let author_str = if page.author_handle.is_empty() {
            page.author.clone()
        } else {
            format!("{} ({})", page.author, page.author_handle)
        };
        md.push_str(&format!("author: \"{}\"\n", author_str));
    }
    if !date.is_empty() {
        md.push_str(&format!("date: {}\n", date));
    }
    md.push_str(&format!("url: {}\n", page.url));
    md.push_str(&format!("category: {}\n", category));
    md.push_str(&format!("clipped: {}\n", clip_date));
    md.push_str("---\n\n");

    // --- Body ---
    match page.page_type.as_str() {
        "x_post" => {
            let display = if !page.author.is_empty() {
                if !page.author_handle.is_empty() {
                    format!("{} {}", page.author, page.author_handle)
                } else {
                    page.author.clone()
                }
            } else {
                "X Post".to_string()
            };
            md.push_str(&format!("# {}\n\n", display));

            for line in page.content.lines() {
                md.push_str(&format!("> {}\n", line));
            }
            md.push('\n');
        }
        "x_thread" => {
            let display = if !page.author.is_empty() {
                page.author.clone()
            } else {
                "X Thread".to_string()
            };
            md.push_str(&format!("# {} (thread)\n\n", display));

            for (i, part) in page.content.split("\n\n---\n\n").enumerate() {
                if i > 0 {
                    md.push_str("\n---\n\n");
                }
                for line in part.lines() {
                    md.push_str(&format!("> {}\n", line));
                }
                md.push('\n');
            }
        }
        "x_article" => {
            let title = if !page.title.is_empty()
                && !page.title.contains(" on X")
                && !page.title.contains(" / X")
            {
                page.title.clone()
            } else if !page.author.is_empty() {
                format!("{} - Article", page.author)
            } else {
                "X Article".to_string()
            };
            md.push_str(&format!("# {}\n\n", title));
            // Content has inline {{IMG:N}} placeholders - resolve them
            let (resolved, _) = resolve_image_placeholders(&page.content, image_filenames);
            md.push_str(&resolved);
            md.push_str("\n\n");
        }
        _ => {
            md.push_str(&format!("# {}\n\n", page.title));
            // Content may have inline {{IMG:N}} placeholders
            let (resolved, _) = resolve_image_placeholders(&page.content, image_filenames);
            md.push_str(&resolved);
            md.push_str("\n\n");
        }
    }

    // For posts/threads (no inline placeholders), add images at bottom
    if matches!(page.page_type.as_str(), "x_post" | "x_thread") && !image_filenames.is_empty() {
        for filename in image_filenames {
            md.push_str(&format!("![[{}]]\n\n", filename));
        }
    }

    // --- Footer ---
    md.push_str("---\n");
    md.push_str(&format!(
        "*Clipped from [{}]({}) on {}*\n",
        domain, page.url, clip_date
    ));

    md
}

// ---------- Main entry point ----------

pub async fn clip_to_obsidian(pet_x: i32, pet_y: i32) -> Result<ClipResult, String> {
    // 1. Connect to browser on the same monitor as ClawPet
    let target = browser::discover_tab_near_position(pet_x, pet_y).await?;
    let ws_url = target
        .web_socket_debugger_url
        .as_deref()
        .ok_or("No WebSocket URL available for tab")?;

    eprintln!("[obsidian-clip] Reading tab: {} - {}", target.title, target.url);

    // 2. Run extraction JavaScript on the page
    let commands = vec![serde_json::json!({
        "method": "Runtime.evaluate",
        "params": {
            "expression": EXTRACTION_JS,
            "returnByValue": true,
            "awaitPromise": false
        }
    })];

    let results = browser::cdp_execute(ws_url, commands).await?;

    let json_str = results
        .first()
        .and_then(|r| r.pointer("/result/result/value"))
        .and_then(|v| v.as_str())
        .ok_or("Failed to extract page content. Is this a supported page?")?;

    let page: ExtractedPage = serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse extraction result: {}", e))?;

    if page.content.trim().is_empty() {
        return Err("No content found on this page.".to_string());
    }

    eprintln!(
        "[obsidian-clip] Extracted: type={}, author={}, images={}",
        page.page_type,
        page.author,
        page.images.len()
    );

    // 3. Categorize
    let category = categorize(&page.text_hints);

    // 4. Create target folder
    let folder = obsidian_base_dir()?.join(category);
    std::fs::create_dir_all(&folder)
        .map_err(|e| format!("Failed to create Obsidian folder: {}", e))?;

    // 5. Generate base filename
    let base_name = generate_base_name(&page);

    // 6. Download and save images to separate ref_img folder
    let img_folder = obsidian_img_dir()?;
    std::fs::create_dir_all(&img_folder)
        .map_err(|e| format!("Failed to create image folder: {}", e))?;

    let mut image_filenames: Vec<String> = Vec::new();
    for (i, img_url) in page.images.iter().enumerate() {
        match download_image(img_url).await {
            Ok((bytes, ext)) => {
                let img_name = format!("{}-img{}", base_name, i + 1);
                let img_path = unique_path(&img_folder, &img_name, &ext);
                if let Err(e) = std::fs::write(&img_path, &bytes) {
                    eprintln!("[obsidian-clip] Failed to save image {}: {}", i + 1, e);
                    continue;
                }
                let filename = img_path
                    .file_name()
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string();
                image_filenames.push(filename);
                eprintln!(
                    "[obsidian-clip] Saved image {}: {} ({} bytes)",
                    i + 1,
                    img_path.display(),
                    bytes.len()
                );
            }
            Err(e) => {
                eprintln!("[obsidian-clip] Failed to download image {}: {}", i + 1, e);
            }
        }
    }

    // 7. Format markdown
    let markdown = format_markdown(&page, category, &image_filenames);

    // 8. Save markdown file
    let md_path = unique_path(&folder, &base_name, "md");
    std::fs::write(&md_path, markdown.as_bytes())
        .map_err(|e| format!("Failed to save markdown: {}", e))?;

    let saved_display = md_path
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    eprintln!("[obsidian-clip] Saved: {}", md_path.display());

    let result_title = match page.page_type.as_str() {
        "x_post" | "x_thread" => {
            if !page.author.is_empty() {
                page.author.clone()
            } else {
                saved_display.clone()
            }
        }
        _ => {
            if !page.title.is_empty() {
                page.title.clone()
            } else {
                saved_display.clone()
            }
        }
    };

    Ok(ClipResult {
        saved_path: md_path.to_string_lossy().to_string(),
        category: category.to_string(),
        title: result_title,
        image_count: image_filenames.len(),
    })
}
