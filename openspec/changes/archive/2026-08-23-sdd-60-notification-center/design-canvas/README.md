# Design canvas sources — SDD-60 Notification Center

These are the **authoring sources** for the published design canvas, kept in the repository so the design survives independently of the hosting service. A URL is a pointer; these files are the content.

Published canvas: https://claude.ai/code/artifact/f46742c0-28ac-4ecb-a2a3-f86dbca2de5f

## Artboards

| File | Artboard | What it shows |
|---|---|---|
| `Flow.dc.html` | The workflow | End-to-end path of one notification: producer → port → center service → dispatcher → channels, with the SQLite read-back into `/notifications`. Carries the three governing rules, including "storage failure never eats the message". |
| `Lifecycle.dc.html` | Record lifecycle | The three verbs the user controls (read/unread, dismiss, archive/restore) and the one they never get (delete). Shows why dismissal carries its own timestamp rather than reusing the read one. |
| `Toast.dc.html` | 1 · Attention — Today | The real Today screen with the toast projection over it. Toast metrics match HeroUI's shipped `.toast` CSS: 460px, `min(32px, var(--radius-3xl))` radius, `px-4 py-3`, `gap-1.5`, `bg-overlay`, no border, region inset 16px. |
| `Main.dc.html` | 2 · Review — Notification Center | The `/notifications` screen. HeroUI Table master list with `selectionMode="multiple"`, the selection bar, sorted `When` column, the `Table.LoadMore` sentinel, and a `Tooltip` open on a truncated title. Detail pane shows the single row-list block. |
| `Anatomy.dc.html` | Block component | The one detail block: one row per thing, four parts always (cover+name / status word / specific detail / per-row action). Records where the earlier `segments`, `reasons`, `links` and `entities` blocks went. |
| `Intents.dc.html` | Actions — PendingIntent model | The app-owned intent registry, the stored token with frozen args, and the carriers that hold it. The three properties that pay: resolved on press, args immutable, carrier ignorant. |
| `Components.dc.html` | Components — packages and imports | Every arrow is a Go import, including the forbidden `center → download` edge drawn crossed out, because avoiding it is what shapes the package structure. |
| `Sequences.dc.html` | Sequences — notify and act | Two hand-authored SVG sequence diagrams: raising a notification (with the unconditional projection arrow highlighted) and pressing an action days later (with press-time resolution highlighted). |

`canvas.json` is the layout manifest — artboard positions, titles, sticky-note annotations, and the launch view.

## Format

Each `.dc.html` is a self-contained Design Component: canonical HTML inside `<x-dc>`, a `<helmet><style>` block, inline styles, and hand-authored inline SVG for diagrams. No libraries, no external assets, no network. They open in a browser directly, and re-seed into a canvas with the `design` skill's `seed-canvas.mjs`.

Colors are lifted from the running app, not invented: background `#09090B`, surface `#18181B`, border `#27272A`, foreground `#FCFCFC`, muted `#9F9FA9`, accent `#0385F7`, success `#17C964`, warning `#F7B750`, danger `#DB3B3E`, and `#71717A` for a terminated run's unattempted episodes. Layout values are lifted the same way: 64px rail, `h-10`/`rounded-lg` rail items, 24px card radius, `p-4` card padding, 96px cover slot.
