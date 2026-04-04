use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct IndexEntry {
    pub file: String,
    pub category: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub summary: String,
    #[serde(default)]
    pub date: String,
}

fn index_path() -> Result<PathBuf, String> {
    let base = std::env::var("CLAWPET_OBSIDIAN_BASE")
        .map_err(|_| "CLAWPET_OBSIDIAN_BASE not set".to_string())?;
    Ok(PathBuf::from(base).join("vault-index.json"))
}

pub fn load_index() -> Result<Vec<IndexEntry>, String> {
    let path = index_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let data = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read vault index: {}", e))?;
    serde_json::from_str(&data)
        .map_err(|e| format!("Failed to parse vault index: {}", e))
}

pub fn save_index(entries: &[IndexEntry]) -> Result<(), String> {
    let path = index_path()?;
    let json = serde_json::to_string_pretty(entries)
        .map_err(|e| format!("Failed to serialize vault index: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write vault index: {}", e))
}

pub fn add_entry(entry: IndexEntry) -> Result<(), String> {
    let mut entries = load_index()?;
    // Remove existing entry for same file (upsert)
    entries.retain(|e| e.file != entry.file);
    entries.push(entry);
    save_index(&entries)
}

/// Serialize index to a compact string for LLM context.
/// Each entry becomes one line: "file | tags | summary"
pub fn index_for_llm() -> Result<String, String> {
    let entries = load_index()?;
    if entries.is_empty() {
        return Ok("(no existing notes)".to_string());
    }
    let lines: Vec<String> = entries
        .iter()
        .map(|e| {
            format!(
                "- {} [{}] {}",
                e.file,
                e.tags.join(", "),
                e.summary
            )
        })
        .collect();
    Ok(lines.join("\n"))
}
