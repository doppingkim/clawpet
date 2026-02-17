<p align="right">
  <a href="./OBJECT_GEN_RULE.md">English</a> | <a href="./OBJECT_GEN_RULE.ko.md">한국어</a>
</p>

# 오브젝트 생성 규칙

ClawGotchi에 새 오브젝트 아이콘을 만들 때 아래 가이드라인을 따르세요.

## 프롬프트 템플릿 (Gemini)

```
Pixel art object icon, top-down 2D, transparent background PNG.
Object: ____
Size: 64x64 pixels.
Crisp pixels, consistent palette with the room background, no text, no shadow blur.
```

## 출력 요구사항

- 투명 배경 PNG
- 64x64 픽셀
- 픽셀 선명한 가장자리 (안티앨리어싱 없음)
- 아늑한 방 스타일에 맞는 색상 팔레트 (따뜻한 나무 톤, 차분한 색상)

## 코드로 생성하기

`scripts/generate_cozy_pack.mjs` 패턴을 활용할 수도 있습니다:

```js
function icon(name, draw) {
  const i = png(64, 64, [0, 0, 0, 0]);
  draw(i);
  save(i, `obj-${name}.png`);
}
```

공유 색상 팔레트:
- 외곽선: `[18, 16, 18, 255]`
- 나무 기본: `[170, 112, 77, 255]`
- 나무 진한: `[132, 84, 58, 255]`
- 크림색: `[241, 234, 210, 255]`

## 파일 위치

생성된 아이콘은 `apps/web/public/assets/obj-{이름}.png`에 저장합니다.

카테고리 시스템에서 참조하는 아이콘은 `obj-{카테고리-id}.png` 네이밍 규칙을 사용합니다.
