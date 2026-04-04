use crate::tag_ontology;
use crate::vault_index::{self, IndexEntry};
use serde::Deserialize;
use std::path::PathBuf;

#[derive(Deserialize, Debug)]
struct LlmResponse {
    category: String,
    summary: String,
    tags: Vec<String>,
    related: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct EnrichResult {
    pub tags_added: usize,
    pub links_added: usize,
    pub category_changed: bool,
    pub new_category: String,
}

fn api_key() -> Result<String, String> {
    std::env::var("CLAWPET_CLAUDE_API_KEY")
        .map_err(|_| "CLAWPET_CLAUDE_API_KEY not set — Phase 2 skipped".to_string())
}

fn build_prompt(content: &str, existing_index: &str) -> String {
    let tag_instructions = tag_ontology::build_tag_instruction();

    format!(
        r#"You are a note classifier for an Obsidian vault. Analyze the following clipped article and return a JSON object.

## Categories (pick exactly one)
- "tech" — development, AI/ML, infrastructure, open source
- "finance" — macro economy, stocks, crypto, bonds
- "insight" — career, productivity, inspiration, business strategy

## Tag Instructions
{tag_instructions}

## Existing Notes in Vault
{existing_index}

## Task
1. Pick the best category
2. Extract 5-8 tags (mix of domain, entity, perspective)
3. Write a one-sentence Korean summary (under 80 chars)
4. Pick up to 3 related notes from the existing vault (by filename, only if truly related)

Return ONLY valid JSON, no markdown fences:
{{"category":"...","summary":"...","tags":["..."],"related":["filename1.md","filename2.md"]}}

## Article Content
{content}"#,
        tag_instructions = tag_instructions,
        existing_index = existing_index,
        content = &content[..content.floor_char_boundary(6000)],
    )
}

async fn call_claude_api(prompt: &str) -> Result<String, String> {
    let key = api_key()?;
    let client = reqwest::Client::new();

    let body = serde_json::json!({
        "model": "claude-haiku-4-5-20251001",
        "max_tokens": 400,
        "messages": [{"role": "user", "content": prompt}]
    });

    let resp = client
        .post("https://api.anthropic.com/v1/messages")
        .header("x-api-key", &key)
        .header("anthropic-version", "2023-06-01")
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Claude API request failed: {}", e))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        return Err(format!("Claude API error {}: {}", status, text));
    }

    let json: serde_json::Value = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse Claude response: {}", e))?;

    json.pointer("/content/0/text")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| "Unexpected Claude API response structure".to_string())
}

fn parse_llm_response(raw: &str) -> Result<LlmResponse, String> {
    // Strip markdown fences if present
    let trimmed = raw.trim();
    let json_str = if trimmed.starts_with("```") {
        trimmed
            .trim_start_matches("```json")
            .trim_start_matches("```")
            .trim_end_matches("```")
            .trim()
    } else {
        trimmed
    };
    serde_json::from_str(json_str)
        .map_err(|e| format!("Failed to parse LLM JSON: {} — raw: {}", e, &raw[..raw.len().min(200)]))
}

fn update_frontmatter(md_content: &str, llm: &LlmResponse) -> String {
    // Find frontmatter boundaries
    let Some(start) = md_content.find("---") else {
        return md_content.to_string();
    };
    let Some(end) = md_content[start + 3..].find("---") else {
        return md_content.to_string();
    };
    let end = start + 3 + end + 3; // include closing ---

    let frontmatter = &md_content[start..end];
    let body = &md_content[end..];

    // Build new frontmatter lines, preserving existing fields
    let mut lines: Vec<String> = Vec::new();
    let mut in_old_tags = false;
    let mut in_old_related = false;

    for line in frontmatter.lines() {
        if line == "---" {
            continue;
        }
        // Skip old tags/related blocks (we'll re-add them)
        if line.starts_with("tags:") {
            in_old_tags = true;
            in_old_related = false;
            continue;
        }
        if line.starts_with("related:") {
            in_old_related = true;
            in_old_tags = false;
            continue;
        }
        if (in_old_tags || in_old_related) && line.starts_with("  - ") {
            continue;
        }
        in_old_tags = false;
        in_old_related = false;

        // Update category and summary inline
        if line.starts_with("category:") {
            lines.push(format!("category: {}", llm.category));
            continue;
        }
        if line.starts_with("summary:") {
            continue; // will re-add below
        }
        lines.push(line.to_string());
    }

    // Add new fields
    lines.push(format!("summary: \"{}\"", llm.summary.replace('"', "'")));
    lines.push("tags:".to_string());
    for tag in &llm.tags {
        lines.push(format!("  - {}", tag));
    }
    if !llm.related.is_empty() {
        lines.push("related:".to_string());
        for rel in &llm.related {
            let name = rel.trim_end_matches(".md");
            lines.push(format!("  - \"[[{}]]\"", name));
        }
    }

    format!("---\n{}\n---{}", lines.join("\n"), body)
}

/// Main enrichment function. Called asynchronously after Phase 1 save.
pub async fn enrich_note(md_path: &str, content_text: &str) -> Result<EnrichResult, String> {
    let existing_index = vault_index::index_for_llm()?;
    let prompt = build_prompt(content_text, &existing_index);

    let raw_response = call_claude_api(&prompt).await?;
    let llm = parse_llm_response(&raw_response)?;

    // Read current file
    let path = PathBuf::from(md_path);
    let md_content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read saved note: {}", e))?;

    // Update frontmatter
    let updated = update_frontmatter(&md_content, &llm);

    // Check if category changed — may need to move file
    let base_dir = std::env::var("CLAWPET_OBSIDIAN_BASE")
        .map_err(|_| "CLAWPET_OBSIDIAN_BASE not set".to_string())?;
    let base = PathBuf::from(&base_dir);

    let current_category = path
        .parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("");
    let category_changed = current_category != llm.category
        && ["tech", "finance", "insight"].contains(&llm.category.as_str());

    let final_path = if category_changed {
        let new_folder = base.join(&llm.category);
        std::fs::create_dir_all(&new_folder)
            .map_err(|e| format!("Failed to create folder: {}", e))?;
        let filename = path.file_name().unwrap();
        let new_path = new_folder.join(filename);
        // Write to new location, delete old
        std::fs::write(&new_path, updated.as_bytes())
            .map_err(|e| format!("Failed to write moved note: {}", e))?;
        std::fs::remove_file(&path).ok(); // best-effort delete old
        new_path
    } else {
        std::fs::write(&path, updated.as_bytes())
            .map_err(|e| format!("Failed to update note: {}", e))?;
        path.clone()
    };

    // Update vault index
    let relative_path = final_path
        .strip_prefix(&base)
        .unwrap_or(&final_path)
        .to_string_lossy()
        .replace('\\', "/");

    vault_index::add_entry(IndexEntry {
        file: relative_path,
        category: llm.category.clone(),
        tags: llm.tags.clone(),
        summary: llm.summary.clone(),
        date: String::new(), // will be extracted from frontmatter if needed
    })?;

    Ok(EnrichResult {
        tags_added: llm.tags.len(),
        links_added: llm.related.len(),
        category_changed,
        new_category: llm.category,
    })
}
