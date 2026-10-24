# Airis splash screen

The window shows Airis running with a bucket of popcorn while the frontend loads. It covers the
gap between the window opening and React's first render, which is longest on a cold `wails dev`
start: the whole module graph must arrive before anything evaluates.

## Why the app is imported after `load`

Wails v2 keeps the WebView2 control invisible until the page's first `NavigationCompleted`, which
fires with the `load` event (`wails/v2/internal/frontend/desktop/windows/frontend.go`,
`navigationCompleted`). Until then the window shows only `BackgroundColour`. A static
`<script type="module" src>` delays `load` until its whole import graph has loaded and run, so with
that tag the splash is in the DOM but never on screen. `index.html` therefore imports
`./src/main.tsx` from a `load` listener: the window appears as soon as the HTML and the sprite arrive.

Headless Edge has no such gate, so `render:smoke` cannot catch a regression here. Check the real
window: hold `/src/main.tsx` back with a delaying proxy in front of Vite and capture the window. A
static entry script shows only the background colour for the whole delay; the deferred import shows
the splash from the first frame. Measured on 2026-10-24 with an 8 s hold.

## How it works

| Piece | Where | Rule |
|---|---|---|
| Markup and CSS | `frontend/index.html` | Plain HTML and an inline `<style>`; it paints before any script runs |
| App entry | `frontend/index.html` | `addEventListener('load', () => import('./src/main.tsx'))`, never a static entry script |
| Removal | `#root` | The splash lives inside `#root`, so React's first render replaces it. No script removes it |
| Animation | Inline CSS keyframes | Only `transform` and `opacity`, so it keeps running on the compositor while the main thread loads the app |
| Reduced motion | `prefers-reduced-motion: reduce` | Every animation stops; the first frame stays |
| Accessibility | `role="status"`, `aria-live="polite"` | Labelled "Loading Autoreas Bridge" through an sr-only span; the art is `aria-hidden` |
| Background | `--splash-bg` | HeroUI's dark `--background` value, literal because the app stylesheet has not loaded yet |
| Guard | `frontend/scripts/render-smoke.mjs` | Fails when the splash is still in the DOM after the render: React never mounted |

The splash is a fixed 1024x768 stage centred in the window, with the ground lines and stars spanning
the full width. Airis runs in place; the ground, the stars and the speed lines scroll left to sell the
motion. She never arrives anywhere: the app loads first.

## The sprite

`frontend/src/assets/airis-splash/popcorn-run.webp` is one eight-frame run cycle: a 3520x440 strip of
440 px cells, played with `steps(8)` over 0.667 s (12 fps, on twos). The frames follow the classic run
breakdown: contact, down, passing, up, then the same with the other leg. The shadow shrinks on frames
4 and 8, the airborne poses.

The artwork is generated, not drawn by hand. Regenerate it with the `airis-sprite-animation` skill
(`.claude/skills/airis-sprite-animation/SKILL.md`); never retouch a generated frame, because local
edits smear the hair and break the cel shading.

## Known deviation from the character contract

`character.md` puts the feather clip on her left side only, hidden in a right-facing profile. The
approved sprite shows the clip while she runs to the right. The next regeneration should use
`turnaround.webp` as the reference and state the clip's side in the prompt.
