mod config_reader;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .invoke_handler(tauri::generate_handler![config_reader::read_openclaw_config, fetch_image_url, read_image_file])
        .setup(|app| {
            // Build tray menu
            let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let hide = MenuItem::with_id(app, "hide", "Hide", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &hide, &quit])?;

            let tray_icon = Image::from_bytes(include_bytes!("../../public/tray/tray-icon.png"));
            let icon = match tray_icon {
                Ok(img) => img,
                Err(_) => app.default_window_icon().cloned().unwrap_or_else(|| {
                    Image::new(&[0u8; 4], 1, 1)
                }),
            };

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("ClawGotchi")
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
