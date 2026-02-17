<p align="right">
  <a href="./OBJECT_GEN_RULE.md">English</a> | <a href="./OBJECT_GEN_RULE.ko.md">한국어</a>
</p>

# Object Generation Rule

When creating new object icons for ClawGotchi, use the following guidelines.

## Prompt Template (Gemini)

```
Pixel art object icon, top-down 2D, transparent background PNG.
Object: ____
Size: 64x64 pixels.
Crisp pixels, consistent palette with the room background, no text, no shadow blur.
```

## Output Requirements

- Transparent PNG
- 64x64 pixels
- Pixel-crisp edges (no anti-aliasing)
- Color palette should match the cozy room style (warm wood tones, muted colors)

## Programmatic Generation

Alternatively, use the `scripts/generate_cozy_pack.mjs` pattern:

```js
function icon(name, draw) {
  const i = png(64, 64, [0, 0, 0, 0]);
  draw(i);
  save(i, `obj-${name}.png`);
}
```

Use the shared color palette:
- Outline: `[18, 16, 18, 255]`
- Wood base: `[170, 112, 77, 255]`
- Wood dark: `[132, 84, 58, 255]`
- Cream: `[241, 234, 210, 255]`

## File Location

Place generated icons in `apps/web/public/assets/obj-{name}.png`.

Icons referenced by the category system use the naming convention `obj-{category-id}.png`.
