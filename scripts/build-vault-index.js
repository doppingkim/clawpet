// One-time script to build vault-index.json from existing notes.
// Run: node scripts/build-vault-index.js

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const VAULT_BASE = "C:/obsidian/doyeon/03 Resources";
const SCAN_FOLDERS = [
  "tech", "finance", "insight",
  "x_discord_ai", "doppinglab_research", "ai_articles",
];
const OUTPUT = path.join(VAULT_BASE, "vault-index.json");

function extractFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return {};
  const fm = {};
  let currentKey = null;
  let currentList = null;
  for (const line of match[1].split("\n")) {
    const kvMatch = line.match(/^(\w+):\s*(.*)$/);
    if (kvMatch) {
      if (currentKey && currentList) {
        fm[currentKey] = currentList;
      }
      currentKey = kvMatch[1];
      const val = kvMatch[2].trim();
      if (val === "") {
        currentList = [];
      } else {
        fm[currentKey] = val.replace(/^["']|["']$/g, "");
        currentKey = null;
        currentList = null;
      }
    } else if (currentList !== null && line.match(/^\s+-\s+(.+)$/)) {
      currentList.push(line.match(/^\s+-\s+(.+)$/)[1].replace(/^["']|["']$/g, ""));
    }
  }
  if (currentKey && currentList) {
    fm[currentKey] = currentList;
  }
  return fm;
}

const entries = [];

for (const folder of SCAN_FOLDERS) {
  const dir = path.join(VAULT_BASE, folder);
  if (!fs.existsSync(dir)) continue;

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    const fm = extractFrontmatter(content);
    entries.push({
      file: `${folder}/${file}`,
      category: fm.category || folder,
      tags: Array.isArray(fm.tags) ? fm.tags : [],
      summary: fm.summary || "",
      date: fm.date || "",
    });
  }
}

fs.writeFileSync(OUTPUT, JSON.stringify(entries, null, 2), "utf8");
console.log(`Built vault-index.json with ${entries.length} entries`);
console.log(`Saved to: ${OUTPUT}`);
