/// Default tag lists for the semi-constrained ontology.
/// Domain and perspective tags have a base list; entity tags are free-form.

pub const DOMAIN_TAGS: &[&str] = &[
    "ai", "semiconductor", "crypto", "macro", "robotics",
    "frontend", "backend", "devtools", "energy", "bio",
    "career", "productivity", "open-source", "infra", "data", "security",
];

pub const PERSPECTIVE_TAGS: &[&str] = &[
    "analysis", "tutorial", "opinion", "news", "deep-dive",
    "earnings", "guide", "comparison", "case-study",
];

pub fn build_tag_instruction() -> String {
    format!(
        "Domain tags (pick from this list first, create new only if none fit): {}\n\
         Perspective tags (pick from this list first): {}\n\
         Entity tags: freely create for specific companies, technologies, people mentioned.\n\
         Rules: all lowercase, hyphens for spaces (e.g. silicon-photonics), 5-8 tags total.",
        DOMAIN_TAGS.join(", "),
        PERSPECTIVE_TAGS.join(", "),
    )
}
