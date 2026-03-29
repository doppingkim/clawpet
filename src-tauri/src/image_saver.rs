use crate::browser;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

fn slide_save_dir() -> Result<PathBuf, String> {
    std::env::var("CLAWPET_SLIDE_SAVE_DIR")
        .map(PathBuf::from)
        .map_err(|_| "CLAWPET_SLIDE_SAVE_DIR is not set".to_string())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ImageSaveResult {
    pub saved_count: usize,
    pub slide_number: u32,
    pub save_dir: String,
}

fn next_slide_number(dir: &PathBuf, date_prefix: &str) -> u32 {
    let pattern = format!("{}-Slide-", date_prefix);
    let mut max_slide: u32 = 0;
    if let Ok(entries) = std::fs::read_dir(dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if let Some(rest) = name.strip_prefix(&pattern) {
                if let Some(num_str) = rest.split('-').next() {
                    if let Ok(num) = num_str.parse::<u32>() {
                        max_slide = max_slide.max(num);
                    }
                }
            }
        }
    }
    max_slide + 1
}

#[derive(Deserialize)]
struct ImageRect {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

const FIND_IMAGES_JS: &str = r#"(function() {
  var imgs = [];
  var slideImgs = document.querySelectorAll('.scrollable-list-item img');
  if (slideImgs.length > 0) {
    imgs = Array.from(slideImgs);
  } else {
    var allImgs = document.querySelectorAll('img');
    for (var j = 0; j < allImgs.length; j++) {
      if ((allImgs[j].src || '').indexOf('lh3.googleusercontent.com/notebooklm/') !== -1) {
        imgs.push(allImgs[j]);
      }
    }
  }
  if (imgs.length === 0) {
    var allImgs2 = document.querySelectorAll('img');
    for (var k = 0; k < allImgs2.length; k++) {
      var w = allImgs2[k].naturalWidth || allImgs2[k].width;
      var h = allImgs2[k].naturalHeight || allImgs2[k].height;
      if (w >= 300 && h >= 200) imgs.push(allImgs2[k]);
    }
  }
  return JSON.stringify({ count: imgs.length });
})()"#;

fn scroll_and_get_rect_js(index: usize) -> String {
    format!(
        r#"(function() {{
  var imgs = [];
  var slideImgs = document.querySelectorAll('.scrollable-list-item img');
  if (slideImgs.length > 0) {{
    imgs = Array.from(slideImgs);
  }} else {{
    var allImgs = document.querySelectorAll('img');
    for (var j = 0; j < allImgs.length; j++) {{
      if ((allImgs[j].src || '').indexOf('lh3.googleusercontent.com/notebooklm/') !== -1) {{
        imgs.push(allImgs[j]);
      }}
    }}
  }}
  if ({index} >= imgs.length) return JSON.stringify(null);
  var img = imgs[{index}];
  img.scrollIntoView({{ block: 'center', inline: 'center' }});
  var rect = img.getBoundingClientRect();
  return JSON.stringify({{
    x: rect.x, y: rect.y, width: rect.width, height: rect.height
  }});
}})()"#,
        index = index
    )
}

pub async fn save_browser_images(pet_x: i32, pet_y: i32) -> Result<ImageSaveResult, String> {
    let target = browser::discover_tab_near_position(pet_x, pet_y).await?;
    let ws_url = target
        .web_socket_debugger_url
        .as_deref()
        .ok_or("No WebSocket URL")?;

    let save_dir = slide_save_dir()?;
    std::fs::create_dir_all(&save_dir).map_err(|e| e.to_string())?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Single persistent CDP session for all operations
    let mut session = browser::CdpSession::connect(ws_url).await?;

    // Step 1: Count images
    let res1 = session
        .send(serde_json::json!({
            "method": "Runtime.evaluate",
            "params": {
                "expression": FIND_IMAGES_JS,
                "returnByValue": true,
                "awaitPromise": false
            }
        }))
        .await?;

    let count_json = res1
        .pointer("/result/result/value")
        .and_then(|v| v.as_str())
        .ok_or("Failed to read page")?;
    let count_obj: serde_json::Value =
        serde_json::from_str(count_json).map_err(|e| e.to_string())?;
    let img_count = count_obj
        .get("count")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as usize;

    if img_count == 0 {
        session.close().await;
        return Err("No images found on this page.".to_string());
    }

    let slide_num = next_slide_number(&save_dir, &today);

    // Step 2: For each image — scroll into view, capture screenshot
    let mut saved_count: usize = 0;

    for i in 0..img_count {
        // Scroll image into view and get rect
        let scroll_js = scroll_and_get_rect_js(i);
        let res_scroll = match session
            .send(serde_json::json!({
                "method": "Runtime.evaluate",
                "params": {
                    "expression": scroll_js,
                    "returnByValue": true,
                    "awaitPromise": false
                }
            }))
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        let rect_str = match res_scroll
            .pointer("/result/result/value")
            .and_then(|v| v.as_str())
        {
            Some(s) if s != "null" => s.to_string(),
            _ => continue,
        };

        let rect: ImageRect = match serde_json::from_str(&rect_str) {
            Ok(r) => r,
            Err(_) => continue,
        };

        if rect.width < 10.0 || rect.height < 10.0 {
            continue;
        }

        // Brief pause for scroll to settle
        tokio::time::sleep(tokio::time::Duration::from_millis(150)).await;

        // Capture screenshot of the image area
        let res_capture = match session
            .send(serde_json::json!({
                "method": "Page.captureScreenshot",
                "params": {
                    "format": "png",
                    "clip": {
                        "x": rect.x,
                        "y": rect.y,
                        "width": rect.width,
                        "height": rect.height,
                        "scale": 1
                    }
                }
            }))
            .await
        {
            Ok(r) => r,
            Err(_) => continue,
        };

        let screenshot_b64 = match res_capture
            .pointer("/result/data")
            .and_then(|v| v.as_str())
        {
            Some(s) => s,
            None => continue,
        };

        use base64::Engine;
        let png_bytes = match base64::engine::general_purpose::STANDARD.decode(screenshot_b64) {
            Ok(b) => b,
            Err(_) => continue,
        };

        let filename = format!(
            "{}-Slide-{:02}-Img-{:02}.png",
            today,
            slide_num,
            saved_count + 1
        );
        if std::fs::write(save_dir.join(&filename), &png_bytes).is_ok() {
            saved_count += 1;
        }
    }

    session.close().await;

    if saved_count == 0 {
        return Err("Failed to capture images.".to_string());
    }

    Ok(ImageSaveResult {
        saved_count,
        slide_number: slide_num,
        save_dir: save_dir.to_string_lossy().to_string(),
    })
}
