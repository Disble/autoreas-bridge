# Airis sprite animation: the process

How the splash run cycle was made, including the dead ends, so the next animation starts from
what worked.

## 1. Story before drawing

A loading animation must read in one loop with no ending: the app replaces it before any
payoff. Pick one action that implies a destination and leave the arrival to the viewer.
Rejected: a wind-up story in four poses (no sense of purpose) and a hand-rigged SVG Airis (not
recognisable as her). Accepted: Airis running with a bucket of popcorn, on her way to anime night.

## 2. Plan the frames like an animation director

A run cycle is eight drawings, four per step (Richard Williams, *The Animator's Survival Kit*):

| Frame | Pose | Body height |
|---|---|---|
| 1, 5 | Contact: front heel touches, back toes leave | middle |
| 2, 6 | Down: weight lands, knee bends | lowest |
| 3, 7 | Passing: free knee swings past the supporting leg | rising |
| 4, 8 | Up: push-off, both feet airborne | highest |

Contacts are the keys; down, passing and up are breakdowns. Play the eight frames on twos
(12 fps, 0.667 s a cycle). Overlapping action sells it: the hair trails a beat behind the body.
A prop that bounces adds secondary action, but loose particles (falling popcorn) read as noise.

## 3. Generate with Codex, verbatim

- Codex's agent rewrites any prose prompt (it produced a tin robot and a mountain lake). Write a
  JS file that calls `tools.image_gen__imagegen` and ask Codex to run it unchanged
  (`assets/ask-codex.md`). Run from Git Bash:
  `codex exec -s workspace-write --skip-git-repo-check -C <dir> -- "$(cat ask-codex.md)" < /dev/null`.
  Without `< /dev/null` it waits on stdin forever; `--full-auto` is not a valid flag.
- The tool takes only `prompt`, `referenced_image_paths`, `num_last_images_to_include` and
  `transparent_background`. There is no size parameter: "wide landscape image, 4 columns by 2
  rows" yields a 1774x887 sheet of 443 px cells.
- Validate the reference path before launching; an empty path silently generates without it.
- Prove delivery: `grep -c "<unique phrase>" ~/.codex/sessions/<yyyy>/<mm>/<dd>/rollout-*.jsonl`
  must be non-zero. Output lands in `~/.codex/generated_images/<session-id>/exec-*.png`.
- One generation per sheet; run sheets one at a time (image generation is rate limited).

## 4. Check the sheet before animating

`assets/build-strip.py` reports per-cell feet rows and border contacts. Feet within a few pixels
across contact and down frames mean the ground line holds; up frames sit higher by design. A
border contact with an empty neighbour is the character's own head at the edge, not a crop.

## 5. Mock, approve, then ship

Mock the animation on a canvas first. On the Design canvas, images are uploaded assets referenced
as `/_blob/<id>`; set `MSYS_NO_PATHCONV=1` when a Git Bash script writes that path. Freeze frames
for review with `animation-play-state: paused` and a negative `animation-delay` per frame, and
screenshot them with headless Edge.

## 6. Verify the shipped splash

- `bun --cwd="frontend" run render:smoke`: green proves React replaced the splash; break
  `App.tsx` on purpose and it must fail with "the splash is still showing".
- Prove the splash paints with no script: fetch the served HTML, strip every `<script>`, add a
  `<base href>` to the server, and screenshot it with headless Edge. Headless Edge writes no
  screenshot when scripts are disabled with `--blink-settings=scriptEnabled=false`.
- Check the real Wails window, not only headless Edge. Wails keeps the WebView invisible until the
  `load` event, so a splash can pass every headless check and never appear. The app starts hidden in
  the tray; launch a second instance to show it. Copy the dev binary under another name first (its
  WebView2 profile folder derives from the exe name and collides with a running instance), put a
  proxy that delays `/src/main.tsx` in front of Vite (target `localhost`: Vite listens on `::1`), and
  capture the window by PID with `EnumWindows` plus `PrintWindow` flag 2.
- Never retouch frames. Inpainting removed flying popcorn but visibly distorted the hair; a
  regeneration with "every kernel stays inside the bucket" fixed it and costs one generation.
