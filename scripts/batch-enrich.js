// Batch-enrich existing notes with tags, summary, and related links via Claude API.
// Run: CLAWPET_CLAUDE_API_KEY=sk-ant-... node scripts/batch-enrich.js
// Optional: --dry-run to preview without writing

const fs = require("fs");
const path = require("path");

const VAULT_BASE = "C:/obsidian/doyeon/03 Resources";
const INDEX_PATH = path.join(VAULT_BASE, "vault-index.json");
const API_KEY = process.env.CLAWPET_CLAUDE_API_KEY;
const DRY_RUN = process.argv.includes("--dry-run");
const ENRICH_FOLDERS = ["tech", "finance", "insight"];

if (!API_KEY) {
  console.error("Set CLAWPET_CLAUDE_API_KEY env var");
  process.exit(1);
}

const DOMAIN_TAGS = [
  "ai", "semiconductor", "crypto", "macro", "robotics",
  "frontend", "backend", "devtools", "energy", "bio",
  "career", "productivity", "open-source", "infra", "data", "security",
];
const PERSPECTIVE_TAGS = [
  "analysis", "tutorial", "opinion", "news", "deep-dive",
  "earnings", "guide", "comparison", "case-study",
];

function loadIndex() {
  if (!fs.existsSync(INDEX_PATH)) return [];
  return JSON.parse(fs.readFileSync(INDEX_PATH, "utf8"));
}

function saveIndex(entries) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(entries, null, 2), "utf8");
}

function indexForLlm(entries) {
  if (!entries.length) return "(no existing notes)";
  return entries
    .map((e) => `- ${e.file} [${e.tags.join(", ")}] ${e.summary}`)
    .join("\n");
}

function buildPrompt(content, existingIndex) {
  return `You are a note classifier for an Obsidian vault. Analyze the following clipped article and return a JSON object.

## Categories (pick exactly one)
- "tech" — development, AI/ML, infrastructure, open source
- "finance" — macro economy, stocks, crypto, bonds
- "insight" — career, productivity, inspiration, business strategy

## Tag Instructions
Domain tags (pick from this list first, create new only if none fit): ${DOMAIN_TAGS.join(", ")}
Perspective tags (pick from this list first): ${PERSPECTIVE_TAGS.join(", ")}
Entity tags: freely create for specific companies, technologies, people mentioned.
Rules: all lowercase, hyphens for spaces (e.g. silicon-photonics), 5-8 tags total.

## Existing Notes in Vault
${existingIndex}

## Task
1. Pick the best category
2. Extract 5-8 tags (mix of domain, entity, perspective)
3. Write a one-sentence Korean summary (under 80 chars)
4. Pick up to 3 related notes from the existing vault (by filename, only if truly related)

Return ONLY valid JSON, no markdown fences:
{"category":"...","summary":"...","tags":["..."],"related":["filename1.md","filename2.md"]}

## Article Content
${content.slice(0, 6000)}`;
}

async function callClaude(prompt) {
  const resp = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) throw new Error(`API error ${resp.status}: ${await resp.text()}`);
  const json = await resp.json();
  return json.content[0].text;
}

function parseLlmResponse(raw) {
  let str = raw.trim();
  if (str.startsWith("```")) {
    str = str.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
  }
  return JSON.parse(str);
}

function updateFrontmatter(content, llm) {
  const fmMatch = content.match(/^(---\n)([\s\S]*?)\n(---)/);
  if (!fmMatch) return content;

  const lines = [];
  let skipBlock = false;
  for (const line of fmMatch[2].split("\n")) {
    if (line.startsWith("tags:") || line.startsWith("related:") || line.startsWith("summary:")) {
      skipBlock = true;
      continue;
    }
    if (skipBlock && line.match(/^\s+-/)) continue;
    skipBlock = false;
    if (line.startsWith("category:")) {
      lines.push(`category: ${llm.category}`);
      continue;
    }
    lines.push(line);
  }

  lines.push(`summary: "${llm.summary.replace(/"/g, "'")}"`);
  lines.push("tags:");
  for (const tag of llm.tags) lines.push(`  - ${tag}`);
  if (llm.related.length) {
    lines.push("related:");
    for (const rel of llm.related) {
      const name = rel.replace(/\.md$/, "");
      lines.push(`  - "[[${name}]]"`);
    }
  }

  const body = content.slice(fmMatch[0].length);
  return `---\n${lines.join("\n")}\n---${body}`;
}

async function main() {
  let index = loadIndex();
  const toEnrich = [];

  for (const folder of ENRICH_FOLDERS) {
    const dir = path.join(VAULT_BASE, folder);
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir).filter((f) => f.endsWith(".md"))) {
      const entry = index.find((e) => e.file === `${folder}/${file}`);
      if (entry && entry.tags.length > 0) continue; // already enriched
      toEnrich.push({ folder, file, path: path.join(dir, file) });
    }
  }

  console.log(`Found ${toEnrich.length} notes to enrich (${DRY_RUN ? "DRY RUN" : "LIVE"})`);

  for (let i = 0; i < toEnrich.length; i++) {
    const note = toEnrich[i];
    const content = fs.readFileSync(note.path, "utf8");
    const existingIndex = indexForLlm(index);

    console.log(`[${i + 1}/${toEnrich.length}] ${note.folder}/${note.file}`);

    try {
      const raw = await callClaude(buildPrompt(content, existingIndex));
      const llm = parseLlmResponse(raw);

      if (DRY_RUN) {
        console.log(`  → category: ${llm.category}, tags: [${llm.tags.join(", ")}]`);
        console.log(`  → summary: ${llm.summary}`);
        console.log(`  → related: [${llm.related.join(", ")}]`);
      } else {
        const updated = updateFrontmatter(content, llm);
        fs.writeFileSync(note.path, updated, "utf8");

        // Update index
        index = index.filter((e) => e.file !== `${note.folder}/${note.file}`);
        index.push({
          file: `${llm.category}/${note.file}`,
          category: llm.category,
          tags: llm.tags,
          summary: llm.summary,
          date: "",
        });
        saveIndex(index);
        console.log(`  ✓ +${llm.tags.length} tags, ${llm.related.length} links`);
      }

      // Rate limit: ~1 req/sec for Haiku
      await new Promise((r) => setTimeout(r, 1200));
    } catch (err) {
      console.error(`  ✗ Failed: ${err.message}`);
    }
  }

  console.log("Done!");
}

main();
