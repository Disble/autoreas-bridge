---
name: frontend-theme
description: >
  Theming + color-token conventions for the autoreas-bridge frontend (HeroUI v3 + Tailwind v4).
  Trigger: When writing or reviewing any frontend UI styling — choosing Tailwind color/background/border
  utilities, building active/selected/hover states, theming components, or debugging "my class isn't
  showing" / invisible backgrounds. Load BEFORE adding color utilities to a .tsx or *.constants.ts.
license: Apache-2.0
metadata:
  author: gentleman-programming
  version: "1.0"
  updatable: true
---

# Skill: frontend-theme

## When to Use

Load this skill whenever you touch frontend visual styling: picking `bg-*` / `text-*` / `border-*` /
`ring-*` classes, building selected/active/hover/focus states, or when a background/color "isn't
showing up". This project's HeroUI v3 + Tailwind v4 setup does **not** expose the token utilities you'd
expect from older HeroUI/NextUI, and several tokens used across the existing code are silent no-ops.

## The stack (ground truth)

- `frontend/src/style.css` is the whole theme entrypoint:
  ```css
  @import "tailwindcss";
  @import "@heroui/styles";
  ```
- HeroUI **v3** (React Aria based) + Tailwind **v4**. There is no `tailwind.config.js` color theme and no
  `--heroui-*` CSS variables; semantic colors live inside HeroUI **component** classes
  (`chip--primary`, `button--primary`, `badge--success`, …), reached via component **props**, not via
  raw Tailwind color utilities.

## CRITICAL: tokens that DO NOT render (verified)

These appear throughout the existing codebase (dashboard + early network feature) but generate **no CSS
rule** — they are silent no-ops. Do **not** rely on them for anything you need to see:

| Dead utility (no-op) | Use instead |
|---|---|
| `bg-primary`, `bg-primary/15`, `bg-primary/10` | core `bg-white/15` (+ `ring-white/30`) for custom emphasis, or a HeroUI component with `color="primary"` |
| `text-primary`, `ring-primary` | `text-foreground` / `ring-white/50` |
| `text-default-400`, `text-default-500` | `text-muted` (dim) / `text-foreground` (bright) |
| `bg-content1`, `bg-content2` (`/30` etc.) | `bg-default`, `bg-surface`, `bg-background`, or `bg-white/[0.02–0.06]` |
| `border-divider` (`/60` etc.) | `border-white/10` (core) — there is no working `border-default`/`border-divider` token |

> Existing `.tsx` files still use these dead tokens. That is pre-existing debt — the app "looks fine"
> because HeroUI component CSS + a few working tokens + element defaults carry it. Don't copy those
> classes into new code.

## Tokens that DO render (verified utilities)

- **Text**: `text-foreground` (bright), `text-muted` (dim). Semantic text: `text-success`,
  `text-warning`, `text-danger`, `text-accent`.
- **Surfaces / bg**: `bg-default`, `bg-background`, `bg-surface`. Semantic bg via `/alpha`:
  `bg-warning/10`, `bg-success/10`, etc.
- **Always safe — Tailwind core** (independent of the HeroUI theme): white/black alpha
  (`bg-white/15`, `text-white`, `ring-white/30`, `border-white/10`), explicit palettes
  (`bg-sky-500`, `text-zinc-400`, …), spacing, layout, typography, `shadow-*`, `rounded-*`,
  `transition-*`, `focus-visible:*`.

## Patterns

### Semantic colors → use HeroUI components, not utilities
For status/level/domain coloring, render a HeroUI component and pass `color`:
```tsx
<Chip color={getNetworkLevelColor(level)} variant="soft"> … </Chip>  // success|warning|danger|accent|default
```
The project's verified color maps live in
`frontend/src/features/network/ui/NetworkPanel/network-panel.helpers.ts`
(`getNetworkLevelColor`, `getNetworkDomainColor`) and mirror `ObservabilityPanel`.

### Active / selected / hover / focus state on a CUSTOM control (button, pill, tab)
Do NOT use `bg-primary` (no-op). Use core white-alpha so it is guaranteed visible on the dark UI.
The verified, in-use pattern (see `network-panel.constants.ts`):
```ts
// active (selected): clearly filled + ring
'bg-white/15 text-white ring-1 ring-inset ring-white/30 shadow-sm'
// inactive: muted + hover affordance
'text-muted hover:bg-white/[0.06] hover:text-foreground'
// base (always): focus ring with a WORKING color
'outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/50'
```
Give every interactive control the full feedback cycle: default → hover → active → focus-visible.

## How to VERIFY a token (and keep this skill updatable)

Never assume a token renders. Confirm against the built CSS:
```bash
cd frontend
bun run build
CSS=$(ls -t dist/assets/*.css | head -1)
grep -Fco "default-400" "$CSS"   # 0 = not generated (dead), >0 = present
```
Use **fixed-string** counts (`grep -Fc`), not anchored selector regex — minified CSS escapes the `/`
in `bg-white\/15` and breaks naive patterns.

## Updating this skill

This skill is `updatable: true`. When you discover a new working/dead token (verified via the build +
`grep -Fc` method above), update the tables here and bump `metadata.version`. Keep claims **verified**,
never speculative — a wrong token claim here will mislead every future agent.
