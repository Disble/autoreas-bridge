---
name: airis-sprite-animation
description: "Trigger: animate Airis, mascot animation, splash screen, sprite sheet, run cycle, key poses, Codex image generation. Generate and ship a looping Airis sprite animation."
license: Apache-2.0
metadata:
  author: autoreas-bridge
  version: "1.0.0"
---

## Activation Contract

Use when Airis must move: the loading splash in `frontend/index.html`, or any new looping mascot
animation. Static empty-state art follows `docs/design/airis/character.md` instead.

## Hard Rules

- Story first: one action a viewer reads in a single loop (she runs carrying popcorn). Approve it in a
  canvas mockup before shipping.
- Generate frames with the Codex CLI; never hand-draw or retouch them. Fix a frame by changing the
  prompt and regenerating: local edits smeared the hair.
- Codex rewrites prompts it is given in prose. Put the prompt in a JS file Codex runs verbatim
  (`assets/gen-sheet.template.js`), then prove it arrived by grepping the session log.
- One cycle = one sprite sheet in one generation: 8 frames, 4 columns x 2 rows, wide landscape.
  Separate generations drift in size, costume and props.
- Reference image: `docs/design/airis/turnaround.webp`. State which side the feather clip is on for
  the view you ask for; ignore props in the reference.
- Play it with CSS only: a 1x8 strip, `transform: translateX` with `steps(8)`, plus `transform` and
  `opacity` effects. Ship `prefers-reduced-motion`.
- In Git Bash, an argument that starts with `/` (`/_blob/...`) is rewritten to a Windows path. Use
  `MSYS_NO_PATHCONV=1` or pass it through a file.

## Decision Gates

| Situation | Action |
|---|---|
| A frame shows an unwanted element | Reword the prompt, regenerate the sheet |
| Feet float or sink below the ground line | Move the sprite window; never the art |
| A cell touches its border | Check whether it is the next cell's art or a head at the edge |
| Codex output ignores the prompt | Check the session log; the exec input must hold your strings |

## Execution Steps

1. Write the story and the poses: `references/process.md` holds the run-cycle breakdown.
2. Copy `assets/gen-sheet.template.js` and `assets/ask-codex.md`, fill them, run Codex.
3. Grep `~/.codex/sessions/<date>/rollout-*.jsonl` for a unique phrase of your prompt.
4. `python assets/build-strip.py sheet.png out.webp`: read every cell's baseline and border report.
5. Mock it in a canvas, get approval, then wire it as `docs/design/airis/splash-screen.md` describes.
6. Run `bun --cwd="frontend" run render:smoke`; it fails while the splash survives the mount.

## Output Contract

Report the story, the Codex prompt proof (log grep count), per-cell baselines, the asset size, and
what was verified in a browser versus only measured.

## References

- `references/process.md` — run-cycle breakdown, prompt anatomy, verification, measured gotchas.
- `docs/design/airis/splash-screen.md` — the shipped splash and its guard.
- `docs/design/airis/character.md` — the character contract every frame must keep.
