mod browser;
mod config_reader;

use std::io::Cursor;

use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};

#[derive(serde::Serialize)]
struct FetchImageResult {
    base64: String,
    mime_type: String,
}

const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024; // 10MB
const MAX_CHAT_ATTACHMENT_BYTES: usize = 4_800_000; // keep below OpenClaw 5MB gateway limit

#[derive(serde::Deserialize)]
struct CaptureRegion {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(serde::Serialize)]
struct CaptureDisplayInfo {
    id: u32,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    is_primary: bool,
}

#[tauri::command]
async fn fetch_image_url(url: String) -> Result<FetchImageResult, String> {
    let response = reqwest::get(&url).await.map_err(|e| e.to_string())?;

    if let Some(content_len) = response.content_length() {
        if content_len as usize > MAX_IMAGE_BYTES {
            return Err("Image exceeds 10MB limit".to_string());
        }
    }

    let header_mime_type = response
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .split(';')
        .next()
        .unwrap_or("")
        .trim()
        .to_string();

    let header_is_image = header_mime_type.starts_with("image/");

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;

    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("Image exceeds 10MB limit".to_string());
    }

    let mime_type = if header_is_image {
        header_mime_type
    } else {
        detect_image_mime(&url, &bytes).ok_or_else(|| "URL is not a supported image".to_string())?
    };

    use base64::Engine;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(FetchImageResult { base64, mime_type })
}

fn detect_image_mime(path: &str, bytes: &[u8]) -> Option<String> {
    // Magic bytes detection
    if bytes.len() >= 4 && bytes[..4] == [0x89, 0x50, 0x4E, 0x47] {
        return Some("image/png".into());
    }
    if bytes.len() >= 3 && bytes[..3] == [0xFF, 0xD8, 0xFF] {
        return Some("image/jpeg".into());
    }
    if bytes.len() >= 4 && &bytes[..4] == b"GIF8" {
        return Some("image/gif".into());
    }
    if bytes.len() >= 12 && &bytes[..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("image/webp".into());
    }
    // Fallback to extension (strip URL query/hash if present)
    let clean_path = path
        .split('?')
        .next()
        .unwrap_or(path)
        .split('#')
        .next()
        .unwrap_or(path);

    match clean_path.rsplit('.').next().map(|s| s.to_lowercase()).as_deref() {
        Some("png") => Some("image/png".into()),
        Some("jpg") | Some("jpeg") => Some("image/jpeg".into()),
        Some("gif") => Some("image/gif".into()),
        Some("webp") => Some("image/webp".into()),
        Some("bmp") => Some("image/bmp".into()),
        _ => None, // Not a recognized image
    }
}

#[tauri::command]
async fn read_image_file(path: String) -> Result<FetchImageResult, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Failed to read file: {e}"))?;

    if bytes.len() > MAX_IMAGE_BYTES {
        return Err("Image exceeds 10MB limit".to_string());
    }

    let mime_type = detect_image_mime(&path, &bytes)
        .ok_or_else(|| "Not a supported image file".to_string())?;

    use base64::Engine;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);

    Ok(FetchImageResult { base64, mime_type })
}

#[tauri::command]
async fn capture_screen_region(region: CaptureRegion) -> Result<FetchImageResult, String> {
    if region.width == 0 || region.height == 0 {
        return Err("Capture area is empty".to_string());
    }

    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {e}"))?;
    if screens.is_empty() {
        return Err("No display found".to_string());
    }

    let center_x = region.x.saturating_add((region.width / 2) as i32);
    let center_y = region.y.saturating_add((region.height / 2) as i32);

    let screen = screens
        .iter()
        .find(|screen| {
            let info = screen.display_info;
            let right = info.x + info.width as i32;
            let bottom = info.y + info.height as i32;
            center_x >= info.x && center_x < right && center_y >= info.y && center_y < bottom
        })
        .or_else(|| screens.first())
        .ok_or_else(|| "No display found".to_string())?;

    let info = screen.display_info;
    let screen_right = info.x + info.width as i32;
    let screen_bottom = info.y + info.height as i32;

    let left = region.x.clamp(info.x, screen_right.saturating_sub(1));
    let top = region.y.clamp(info.y, screen_bottom.saturating_sub(1));

    let max_width = (screen_right - left).max(0) as u32;
    let max_height = (screen_bottom - top).max(0) as u32;
    let width = region.width.min(max_width);
    let height = region.height.min(max_height);

    if width == 0 || height == 0 {
        return Err("Capture area is outside of the display".to_string());
    }

    let rel_x = left - info.x;
    let rel_y = top - info.y;

    let image = screen
        .capture_area(rel_x, rel_y, width, height)
        .map_err(|e| format!("Failed to capture screen: {e}"))?;

    let mut png_bytes = Vec::new();
    {
        let mut cursor = Cursor::new(&mut png_bytes);
        image::DynamicImage::ImageRgba8(image)
            .write_to(&mut cursor, image::ImageFormat::Png)
            .map_err(|e| format!("Failed to encode screenshot: {e}"))?;
    }

    if png_bytes.len() > MAX_IMAGE_BYTES {
        return Err("Image exceeds 10MB limit".to_string());
    }

    use base64::Engine;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);

    Ok(FetchImageResult {
        base64,
        mime_type: "image/png".to_string(),
    })
}

fn encode_dynamic_as_jpeg(
    image: &image::DynamicImage,
    quality: u8,
) -> Result<Vec<u8>, String> {
    let mut bytes = Vec::new();
    {
        let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut bytes, quality);
        encoder
            .encode_image(image)
            .map_err(|e| format!("Failed to encode screenshot: {e}"))?;
    }
    Ok(bytes)
}

fn encode_screen_for_chat(image: image::RgbaImage) -> Result<Vec<u8>, String> {
    let mut current = image::DynamicImage::ImageRgba8(image);
    let qualities = [88u8, 80, 72, 64, 56, 48];

    for _ in 0..5 {
        for quality in qualities {
            let encoded = encode_dynamic_as_jpeg(&current, quality)?;
            if encoded.len() <= MAX_CHAT_ATTACHMENT_BYTES {
                return Ok(encoded);
            }
        }

        let next_width = ((current.width() as f32) * 0.82).round() as u32;
        let next_height = ((current.height() as f32) * 0.82).round() as u32;
        if next_width < 640 || next_height < 360 {
            break;
        }

        current = current.resize(
            next_width,
            next_height,
            image::imageops::FilterType::Triangle,
        );
    }

    Err("Captured screen is too large to attach. Try area capture.".to_string())
}

#[tauri::command]
async fn list_capture_displays() -> Result<Vec<CaptureDisplayInfo>, String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {e}"))?;

    let mut displays: Vec<CaptureDisplayInfo> = screens
        .iter()
        .map(|screen| {
            let info = screen.display_info;
            CaptureDisplayInfo {
                id: info.id,
                x: info.x,
                y: info.y,
                width: info.width,
                height: info.height,
                is_primary: info.is_primary,
            }
        })
        .collect();

    displays.sort_by_key(|display| (display.x, display.y));
    Ok(displays)
}

#[tauri::command]
async fn capture_screen_display(display_id: u32) -> Result<FetchImageResult, String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {e}"))?;

    let screen = screens
        .iter()
        .find(|screen| screen.display_info.id == display_id)
        .ok_or_else(|| "Selected display not found".to_string())?;

    let image = screen
        .capture()
        .map_err(|e| format!("Failed to capture screen: {e}"))?;

    let jpeg_bytes = encode_screen_for_chat(image)?;

    use base64::Engine;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);

    Ok(FetchImageResult {
        base64,
        mime_type: "image/jpeg".to_string(),
    })
}

#[tauri::command]
async fn capture_screen_for_point(x: i32, y: i32) -> Result<FetchImageResult, String> {
    let screens = screenshots::Screen::all().map_err(|e| format!("Failed to list screens: {e}"))?;
    if screens.is_empty() {
        return Err("No display found".to_string());
    }

    let screen = screens
        .iter()
        .find(|screen| {
            let info = screen.display_info;
            let right = info.x + info.width as i32;
            let bottom = info.y + info.height as i32;
            x >= info.x && x < right && y >= info.y && y < bottom
        })
        .or_else(|| screens.first())
        .ok_or_else(|| "No display found".to_string())?;

    let image = screen
        .capture()
        .map_err(|e| format!("Failed to capture screen: {e}"))?;
    let jpeg_bytes = encode_screen_for_chat(image)?;

    use base64::Engine;
    let base64 = base64::engine::general_purpose::STANDARD.encode(&jpeg_bytes);

    Ok(FetchImageResult {
        base64,
        mime_type: "image/jpeg".to_string(),
    })
}

#[tauri::command]
async fn read_browser_page() -> Result<browser::BrowserPageData, String> {
    browser::read_page().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
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
        .setup(|app| {
            // Build tray menu
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let tray_icon = Image::from_bytes(include_bytes!("../icons/32x32.png"));
            let icon = match tray_icon {
                Ok(img) => img,
                Err(_) => app.default_window_icon().cloned().unwrap_or_else(|| {
                    Image::new(&[0u8; 4], 1, 1)
                }),
            };

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("ClawPet")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Show the main window after setup
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

