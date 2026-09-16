# Proposal: Keymap Customization (SDD-62)

Change: `2026-09-11-sdd-62-keymap-customization`
Exploration input: `explore.md` in this folder, from Engram `sdd/2026-09-11-sdd-62-keymap-customization/explore` (observation #9290)
Delivery: `execution_mode=auto`, `artifact_store=openspec`, `delivery_strategy=auto-chain`, `chain_strategy=stacked-to-main`, `review_budget_lines=400`, `strict_tdd: true`. RDD is OFF — no `gentle-ai review` command runs.

> **Size-budget note.** This exceeds the generic 450-word proposal default, for the same reasons
> SDD-61's proposal did: `openspec/config.yaml` `rules.proposal` requires a rollback plan and
> identified affected modules, the orchestrator required explicit answers to seven design questions
> and a bottom-up line forecast, and CLAUDE.md #22 forbids sizing by eye. Content is carried in
> tables rather than prose.

---

## 1. Intent

Two problems, one surface.

**Discoverability.** A real user of this app told us they did not know the `?` help overlay existed
and would never have found it. The overlay is correct and complete; nothing points at it. The user
explicitly **rejected** a floating `?` button and a per-screen corner hint — permanent visual noise
for a power-user feature.

**Ownership of the defaults.** The same user prefers `Ctrl+` to `Alt+`. Today that is a maintainer
decision baked into a module-private constant (`command-registry.constants.ts:13`). It should be
theirs. That reframing matters more than the preference itself: `Ctrl+<digit>` is objectively
*riskier* than `Alt+<digit>` — Chromium binds `Ctrl+0` to reset-zoom and `Ctrl++`/`Ctrl+-` to zoom,
and WebView2 **is** Chromium — so the honest move is not to flip the shipped default but to hand
over the switch and label the hazards.

**Success**: "Settings → Shortcuts" shows the complete, live shortcut map as the first thing on the
panel, every global binding can be rebound by pressing the keys, a conflicting or dead keymap is
always recoverable without the keyboard, and the architecture docs stop claiming a separability that
only ever held for navigation commands.

---

## 2. Scope

### 2.1 In Scope

| # | Deliverable |
|---|---|
| S-1 | **Keymap document + resolution helpers** — a versioned `{ version, bindings: Record<commandId, chord> }` document, plus pure `parse` / `serialize` / `resolveKeymap(commands, overrides)` / `applyOverride` / conflict-check wrapper |
| S-2 | **Go persistence** — `keyKeymap` + `Keymap`/`SetKeymap` on `settings.SQLiteStore`, two methods on the `appSettingsStore` port, two bound `App` methods, and a frontend `PreferencesSource` pair. Go stores an **opaque string** and owns no chord grammar (D3) |
| S-3 | **The override seam, threaded** — `overrides` joins `KeyboardStoreState`; the dispatcher, the help dialog **and** scope frames all resolve against the effective keymap (D1) |
| S-4 | **Scoped chord metadata centralized** — `SCOPED_COMMAND_BINDINGS` in `shared/keyboard/`; `use-notification-keyboard-scope.ts` composes `enabled`/`run` around it instead of hardcoding `chord: 'alt+r'` (D6). This closes explore §3.3 and makes the ADR-019 correction *true* rather than aspirational |
| S-5 | **The Shortcuts panel** — `shared/keyboard/ui/KeymapPanel/` (D5), one new `PREFERENCES_ROUTE_TABS` entry, with the **complete shortcut map rendered first** (D2) and the mandatory loading / empty / error triad |
| S-6 | **Chord capture by listening** — press the keys; `normalizeChord` is the only authority. Self-capture is prevented by the capture control's own `preventDefault()`, which the dispatcher's existing guard 1 already honors (D7) |
| S-7 | **Conflict surfacing at bind time** — reuse `findDuplicateBindings` over the candidate array; never a second checker (D8) |
| S-8 | **Recovery paths** — per-binding revert **and** whole-keymap reset to defaults, both pointer-reachable. Not optional: a user can otherwise bind their way into a dead keymap (D9) |
| S-9 | **Documentation, as a deliverable not a nicety** (user mandate, D10) — correct ADR-019's remapping claim, add an ADR for the override seam, update `.claude/skills/keyboard-shortcuts/SKILL.md` and CLAUDE.md note 23, append one `scripts/log-lesson.mjs` line |

### 2.2 Out of Scope

| Deferred | Why |
|---|---|
| **Flipping the shipped default to `Ctrl+`** | D4. The user's preference becomes *configurable*, not *default*. `Ctrl+0`/`Ctrl++`/`Ctrl+-` collide with Chromium zoom in WebView2; shipping that to every install to satisfy one preference is the wrong trade when the preference is now one click away |
| Multi-key sequences (`g` then `t`) | Already deferred by SDD-61. Unchanged here: the document's values are chord strings, so sequences stay additive |
| Command palette | Already deferred by SDD-61. This change builds its other prerequisite (an override-aware effective registry) but does not build it |
| Per-command `enabled`/`run` in the panel | Only chords are user-owned. Nothing lets a user change what a command *does* |
| `KeyboardScopeFrame.exclusive` | ADR-019's own consequences say it needs a second real consumer first. D7 shows capture does not need it |
| Backing the keymap up | `internal/desktop/app_backup.go:37-41` excludes `app_settings` from the bundle *on purpose* ("machine-local settings"), enforced by which groups appear rather than by a flag. The keymap is therefore machine-local and does **not** survive a backup/restore. Recorded as a consequence (§6), not changed here |
| Verifying whether WebView2 swallows `Alt+<digit>` | Needs a human on the packaged app (CLAUDE.md #23). D9 designs so the answer is not load-bearing |
| Moving `preferences-route.constants.ts` to `src/app/routes` | `.dharness/fallow.jsonc:52-54` already names it as composition living in `shared` by accident. Adding one entry neither fixes nor worsens that; D5 avoids adding to its crossing count |
| Any REST, WebSocket, SQLite-schema or mobile change | A Wails binding is desktop-only. `docs/openapi.yaml` and the mobile sync contract are **untouched, stated explicitly** rather than left unstated. `app_settings` already exists (`internal/sync/schema_tables.go`); no migration |

---

## 3. Capabilities

> Contract with `sdd-spec`. Names researched against `openspec/specs/` — **34 spec files, and
> `keyboard-shortcuts/` is not among them** (SDD-61 is unarchived; see §6).

### New Capabilities

- `keymap-customization`: the keymap document shape and version; override resolution by command
  `id`; orphan-override and no-override semantics; the persistence contract (one JSON document under
  one `app_settings` key, opaque to Go); the panel's obligation to render the complete map first;
  chord capture by listening; bind-time conflict surfacing; and the two mandatory recovery paths.

### Modified Capabilities

- `keyboard-shortcuts`: the dispatcher, the help dialog and scope frames MUST resolve against the
  **effective** keymap rather than the shipped `KEYBOARD_COMMANDS`; and a scoped command's chord
  metadata MUST be declared in `shared/keyboard/`, not inline in a feature hook.

### Explicitly NOT modified

- `desktop-navigation` — no route, nav item or `<h1>` contract changes. Rebinding `alt+1` changes
  which chord opens `/today`, never what `/today` is.
- `openapi` / `mobile-sync-contract` / `sqlite-bootstrap` — zero wire surface, zero schema change.
- `backup-import-export` — §2.2; the existing exclusion is left exactly as it is.

---

## 4. Approach

### D1 — The seam is the store read the dispatcher already performs

`dispatch.helpers.ts:99` already calls `getKeyboardState()` on every keystroke and destructures
`{ frames }`. Adding `overrides` to `KeyboardStoreState` and resolving there costs **no new
parameter, no signature change, and no new plumbing in the listener**:

```
dispatchKeyboardEvent
  └─ getKeyboardState()            -> { frames, overrides }     (line 99, already there)
       └─ resolveCommand(chord, resolveKeymap(frames…), resolveKeymap(KEYBOARD_COMMANDS, overrides))
```

`resolveKeymap` is keyed on `CommandDefinition.id` — the stable identity — because the chord is the
thing being overridden and therefore cannot key its own override. Two call sites read it: the
dispatcher and `use-shortcuts-help-dialog.ts` (which already reads both `useKeyboardStore` and
`KEYBOARD_COMMANDS`, so the overlay stays derived and cannot drift from behaviour).

**Alternatives rejected.** Threading an `overrides` parameter down through `dispatchKeyboardEvent` —
changes a signature four tests pin and gains nothing, since the store is already read. Mutating
`KEYBOARD_COMMANDS` at load — makes the shipped defaults unrecoverable and the registry untestable.

### D2 — The map renders first; nothing is added to any other screen

Confirmed product decision. A persistent `?` badge is permanent noise on every screen for a
power-user feature, while Settings is where someone already goes to learn or configure, so
"Settings → Shortcuts" is a guessable path that costs nothing elsewhere. The map is the **first
block inside the panel**, above the editing affordances, and it lists **every** binding — including
the scoped one, which D6 makes enumerable. A map that silently omits `Alt+R` would be a
discoverability surface that lies.

### D3 — One JSON document under one key; Go stays a dumb pipe

Key: `keyboard.keymap`, matching the existing dotted convention (`downloads.root`,
`system.auto_start`, `downloads.rename_episodes`, `api.addr` — `internal/settings/store.go:19-24`).

| Rejected | Why |
|---|---|
| One `app_settings` row per binding | `internal/settings` has `Get`/`Set` on an exact key and nothing else. Per-row storage needs a `LIKE 'keyboard.binding.%'` prefix scan **and** a delete path — three new SQL shapes for a document that is always read and written whole |
| A generic bound `Get`/`Set` binding | Would widen a deliberately narrow port to "any settings key" and let the frontend write arbitrary rows. A typed `Keymap`/`SetKeymap` pair matches the four pairs already there (`app.go:150-159`) and keeps the port narrow. ADR-017 confirms the multi-method `appSettingsStore` keeps its role suffix |

**Go owns no chord grammar.** It persists an opaque string and returns `""` when unset. Chord
semantics live in `normalizeChord`, in TypeScript, with 100% mutation coverage; a Go validator would
be a second grammar to keep in sync, and the two would drift the first time a chord rule changed.
Parse, validate and version-migrate in the frontend.

### D4 — Rebinding replaces the Alt-vs-Ctrl argument; it does not settle it

The shipped default stays `Alt+<digit>` (S-2.2). The hazard is concrete and recorded so nobody has
to rediscover it: WebView2 is Chromium, `Ctrl+0` resets zoom and `Ctrl++`/`Ctrl+-` zoom. The panel
labels those rows advisory-risky (D9) rather than blocking them.

### D5 — The panel lives in `shared/keyboard/ui/`, not in `features/preferences/`

| Evidence | Consequence |
|---|---|
| `.dharness/fallow.jsonc:64-68` allows `shared -> infrastructure` and **not** `shared -> features` | A panel in `features/` makes `preferences-route.constants.ts` cross the boundary a 4th time |
| `.dharness/fallow.jsonc:47-54` already reports those 3 crossings as "composition work living in `shared` by accident" | `shared/keyboard/ui/KeymapPanel` is a `shared -> shared` import: **crossing count unchanged**. Boundary findings are reported, not blocking, so this is hygiene rather than a gate — stated as such |
| `shared/keyboard/ui/ShortcutsHelpDialog/`, `shared/keyboard/ui/KeyboardDispatcherListener/`, `shared/ordering/ui/AnimeScheduleOrdering/` | Exact in-tree precedent; CLAUDE.md frontend #12b puts stateful shared widgets in `shared/<domain>/` |
| `shared -> infrastructure` is 18 imports today and is "the design, not drift" | The panel reads `infrastructure/preferences-source` on the allowed edge |

Strict colocation per ADR-015, no barrel per ADR-011, `readonly` props, JSDoc on every declaration,
and a plain `const` goes to `.constants.ts` (`dharness/role-file-shape`).

### D6 — Scoped chords DO become remappable, and that is what fixes the doc

Explore §3.3 is the finding that forces a decision. The orchestrator asked for an explicit answer:
**in scope.** Resolution was never the obstacle — overrides apply by `id` at dispatch time regardless
of where the chord was declared. **Discoverability** was: a scope frame exists only while its panel
is mounted, so Settings cannot enumerate `alt+r` at all.

So `{ id, scope, chord, label, section }` for scoped commands moves into `SCOPED_COMMAND_BINDINGS`
in `shared/keyboard/`; `enabled` and `run` stay in the feature, because they close over feature
state. `use-notification-keyboard-scope.ts` spreads the shared entry and adds its two closures
(`features -> shared` is the allowed direction). With exactly **one** scoped command in the tree
today, this costs one constant plus one hook edit — and doing it later costs the same edit plus a
shipped panel that lied about what it covered.

### D7 — Capture by listening, not by list

`normalizeChord` already converts a `KeyboardEvent` into the canonical string and is the only
authority on it. A select-from-a-list UI would need a second, hand-maintained enumeration of every
key token and would drift from the normalizer the first time a rule changed.

**Not capturing its own shortcuts while recording**: the capture control calls `preventDefault()` in
its own `onKeyDown`. React 18 delegates at `#root`, so that runs **before** the `window` bubble
listener, which is exactly the mechanism ADR-019 §3 documents and
`KeyboardDispatcherListener.react-aria.test.tsx` already proves for HeroUI widgets. No dispatcher
change, no scope frame, and no `exclusive` flag. Rejected: a `keymap-capture` scope frame — a frame
only shadows chords it *declares*, so it could not swallow an arbitrary keystroke.

### D8 — Conflicts use the checker that already exists

Apply the candidate override to the full command array, then call
`findDuplicateBindings(candidate)`. It returns every colliding `id`; the panel names them and
refuses to save. **Honest limit, stated rather than papered over**: that function keys on
`${scope}::${chord}` (`registry.helpers.ts:41`), so a scoped override that collides with a *global*
chord is not a duplicate by its definition — and should not be, since `resolveCommand` gives the
innermost frame the win. The panel therefore surfaces that case as a **shadowing warning**, distinct
from a blocking duplicate. Writing a second checker to blur the two would contradict resolution
semantics.

### D9 — An un-deliverable chord must always be recoverable

| Case | Handling |
|---|---|
| Chord the OS or WebView2 may swallow | Advisory note on the row (Chromium zoom family is known; `Alt+<digit>` delivery is **unverified** — CLAUDE.md #23). Advisory, never blocking: blocking a chord we cannot prove is swallowed would be inventing evidence |
| User binds their way into a dead keymap | Per-binding revert **and** whole-keymap reset, both reachable by pointer. Settings is pointer-reachable from the rail even when every chord is dead — including the chord that opens Settings |
| Storage-level escape hatch | `SetKeymap("")` clears the document; an unset key is the canonical default state |

### D10 — Orphans, absences, and why absence is the right default

- **Override for a command that no longer exists**: ignored at resolution (`resolveKeymap` iterates
  *commands* and looks up by id, so it can never resurrect a dead command). It is **not** deleted on
  read — a command renamed and then reverted would otherwise silently lose its binding. Pruning
  happens only when the user next saves.
- **Command with no override**: keeps its declared chord. Absence, not a materialized copy, is the
  default — the same reasoning `store.go:111-115` already gives for `APIAddr`: writing the default
  into the database on first read freezes it, so a later change to the shipped default would never
  reach an install that had already started.
- **Document version**: `version: 1` is stored so a future chord-format change migrates instead of
  guessing. An unreadable or wrong-version document degrades to "no overrides" — shipped defaults —
  never to a crash and never to a partially applied keymap.

---

## 5. Line Budget — bottom-up, per CLAUDE.md #22

**Method**: estimated per declaration against the measured bands in `AGENTS.md` → "Sizing a Change"
(ADR 123-217; HeroUI render test 50-149; `renderHook` test 44-235; subscription hook 73-84;
`shared/<domain>/` module ~160 production, roughly doubling with tests), with Go priced against the
existing `internal/settings/*_test.go` files and the `GetDownloadsRoot`/`SetDownloadsRoot` pair, and
**40-80 lines of artifact prose per slice** because `sdd-attempt` counts it. Mandatory JSDoc is
budgeted per declaration, not per file. SDD-61's forecasts ran 30-70% low in the same direction every
time by undercounting tests, so tests are estimated first here, not last.

| Slice | Content | Prod | Test | Prose | Total |
|---|---|---|---|---|---|
| 62a | S-1: keymap types, helpers, constants (pure, frontend) | ~155 | ~175 | 50 | **~380** |
| 62b | S-2: Go accessor pair, port methods, bound `App` methods, `PreferencesSource` pair | ~60 | ~160 | 50 | **~270** |
| 62c | S-3 + S-4: store field, dispatcher/help/scope wiring, loader hook, `SCOPED_COMMAND_BINDINGS` adoption | ~100 | ~220 | 50 | **~370** |
| 62d | S-5: read-only map rendered first, tab entry, loading/empty/error triad | ~250 | ~220 | 50 | **~520** |
| 62e | S-6 + S-7 + S-8: capture control, conflict/shadow surfacing, revert and reset | ~230 | ~280 | 50 | **~560** |
| 62f | S-9: ADR-019 correction, new seam ADR, skill + CLAUDE.md #23 update, learning-log line | ~260 | — | 50 | **~310** |
| | **Total** | **~1,055** | **~1,055** | **300** | **~2,410** |

Generated Wails bindings cost **zero** authored lines: `frontend/wailsjs/` is gitignored
(`.gitignore:12`), so `App.d.ts`/`App.js` are never committed.

**Roughly 6x the 400-line budget, so this is multi-slice by construction, not by choice.** The 50%
production / 50% test split is the measured shape of this repo, not a guess. `delivery_strategy` is
already `auto-chain` with `chain_strategy=stacked-to-main`, so the exit is pre-resolved: six stacked
slices, each independently mergeable, each leaving the app working. **62d exceeds 400 on its own and
62e exceeds it further** — `sdd-tasks` owns the final split and MUST emit the §E guard lines; a
plausible sub-split is 62d into "map + tab entry" and "the three states", and 62e into "capture" and
"conflict + recovery". Treat every figure here as ±20% and re-measure bottom-up per slice.

---

## 6. Codebase Drift and Ordering Recorded (CLAUDE.md #2 — the code wins)

1. **`openspec/specs/keyboard-shortcuts/spec.md` does not exist.** SDD-61 is unarchived, so its spec
   still lives at `openspec/changes/2026-09-10-sdd-61-keyboard-shortcuts/specs/keyboard-shortcuts/spec.md`.
   SDD-62's delta for the modified capability must be authored against **that** file, and the two
   changes MUST archive in order (61, then 62). This is a hard dependency, not a preference (R-1).
2. **SDD-61 was still being applied when this proposal was written.** `ShortcutsHelpDialog` and
   `KeyboardDispatcherListener` already exist on disk; slices 2b, 3 and 4 were in flight. Every
   `file:line` cited here was read from disk during this phase, but `sdd-spec`/`sdd-design` MUST
   re-read `shared/keyboard/` rather than trusting these line numbers.
3. **`NAV_COMMAND_CHORDS` privacy is a deliberate artifact of the dead-code rule**, not an
   oversight. SDD-62 makes the panel read the *effective registry* through the store rather than
   re-exporting the raw constant, so the rule is honored rather than amended.
4. **The keymap will not travel in a backup.** `app_backup.go:37-41` excludes `app_settings` by
   design. Recorded as a user-visible consequence: reinstalling loses the keymap.

---

## 7. Affected Areas

| Area | Impact | Description |
|---|---|---|
| `frontend/src/shared/keyboard/keymap.types.ts`, `keymap.helpers.ts`, `keymap.constants.ts` | **New** | Document shape, `resolveKeymap`, parse/serialize, `SCOPED_COMMAND_BINDINGS`, version constant. Colocated `__tests__/`, no barrel |
| `frontend/src/shared/keyboard/keyboard.types.ts` | **Modified** | `overrides` joins `KeyboardStoreState` |
| `frontend/src/shared/keyboard/keyboard.constants.ts` | **Modified** | `keyboardStore` initial state gains `overrides` |
| `frontend/src/shared/keyboard/keyboard-scope.helpers.ts` | **Modified** | `setKeymapOverrides` beside `setKeyboardHelpOpen`; `resetKeyboardStore` clears it |
| `frontend/src/shared/keyboard/dispatch.helpers.ts` | **Modified** | Line ~99-100: resolve against the effective keymap for both globals and frames |
| `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/use-shortcuts-help-dialog.ts` | **Modified** | Same resolution, so the overlay stays derived |
| `frontend/src/shared/keyboard/use-keymap-overrides.ts` | **New** | Loads the persisted document once and publishes it into the store |
| `frontend/src/shared/keyboard/ui/KeymapPanel/` | **New** | `KeymapPanel.tsx`, `use-keymap-panel.ts`, `keymap-panel.{types,constants,helpers}.ts`, chord-capture control, `__tests__/` (D5, ADR-015, ADR-011) |
| `frontend/src/shared/preferences/preferences-route.constants.ts` | **Modified** | One `PREFERENCES_ROUTE_TABS` entry — `shared -> shared`, adding no boundary crossing |
| `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-keyboard-scope.ts` | **Modified** | Reads `SCOPED_COMMAND_BINDINGS` instead of `chord: 'alt+r'` (line 28). `use-notification-mark-all-read.ts` is untouched |
| `frontend/src/infrastructure/preferences-source/preferences-source.{types,helpers}.ts` | **Modified** | `getKeymap`/`setKeymap`, guarded by `waitForBindings`/`hasGoBinding` like every existing method |
| `internal/settings/store.go` | **Modified** | `keyKeymap` + `Keymap`/`SetKeymap`. New `internal/settings/keymap_test.go` |
| `internal/desktop/app.go` | **Modified** | Two methods on the `appSettingsStore` port (lines 150-159) |
| `internal/desktop/app_preferences.go` | **Modified** | `GetKeymap`/`SetKeymap` bound methods, nil-tolerant like their neighbours. New `internal/desktop/app_keymap_test.go` |
| `docs/adr/019-keyboard-command-registry.md` | **Modified** | Correct the remapping claim (lines ~152-154 and the §1 table): separability held for navigation commands only. D6 records what made it true |
| `docs/adr/020-keymap-override-seam.md` | **New** | The seam, the document shape, Go-as-dumb-pipe, capture-by-listening, recovery |
| `.claude/skills/keyboard-shortcuts/SKILL.md` | **Modified** | "Known limits" row for remapping becomes shipped; new section on overrides and `SCOPED_COMMAND_BINDINGS`; version bump |
| `CLAUDE.md` / `AGENTS.md` note 23 | **Modified** | Amend with the override seam |
| `docs/learning-log.md` | **Appended** | Via `node scripts/log-lesson.mjs` only, never by hand (CLAUDE.md #17) |
| `frontend/wailsjs/go/desktop/App.{d.ts,js}` | **Regenerated, not committed** | Gitignored (`.gitignore:12`). Apply-time gotcha: `tsc` fails on the new import until the bindings regenerate — a side effect of `wails dev` / `wails build` |
| `docs/openapi.yaml`, mobile sync contract, SQLite schema | **Untouched** | Stated explicitly. Desktop-only binding; `app_settings` already exists |

---

## 8. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | Archive ordering: SDD-62's delta targets a `keyboard-shortcuts` spec that lives only in SDD-61's unarchived change folder | **High** | **High** | §6.1. `sdd-spec` authors against SDD-61's spec file; archive 61 before 62. `sdd-archive` MUST refuse otherwise |
| R-2 | ~2,410 authored lines against a 400-line budget | **High** | **High** | §5: six pre-declared stacked slices under the already-cached `auto-chain`/`stacked-to-main` strategy; 62d and 62e sub-split at the `sdd-tasks` gate |
| R-3 | A user binds a chord WebView2 or the OS swallows and cannot undo it | Medium | **High** | D9: pointer-reachable reset and per-binding revert; `SetKeymap("")` as the storage escape hatch. Tested as a requirement, not an affordance |
| R-4 | The capture control captures its own chord (pressing `?` opens the overlay mid-recording) | Medium | Medium | D7: `preventDefault()` in the control's `onKeyDown`, the exact mechanism ADR-019 §3 documents. Proof obligation: a test firing `?` and `alt+1` into the recording control asserting neither command runs |
| R-5 | Bottom-up estimate still low, repeating SDD-61's 30-70% miss | Medium | Medium | §5 states the method and the ±20% band, prices tests first and includes prose. Each slice re-measures with `wc -l` against comparables before apply |
| R-6 | Scoped-metadata centralization (D6) regresses `Alt+R` silently — the scope hook keeps working while the chord comes from the wrong place | Medium | Medium | Its existing test (`__tests__/use-notification-keyboard-scope.test.ts`) asserts the chord; extend it to prove the value comes from the shared constant, and mutation-test the lookup |
| R-7 | A malformed or hand-edited `keyboard.keymap` row bricks the keyboard at startup | Low | **High** | D10: parse failure degrades to shipped defaults. Tested with garbage, wrong version, unknown ids and a null document |
| R-8 | The `?` overlay and the Settings map disagree | Low | Medium | Both resolve through the same `resolveKeymap` over the same store (D1). A test registers an override and asserts both surfaces show it |
| R-9 | Go grows a chord validator and the two grammars drift | Low | Medium | D3 makes it explicit: Go persists an opaque string. `sdd-verify` MUST report any chord parsing in Go as a defect |
| R-10 | A `.tsx` or hook crosses the 500-line hard fail | Low | Low | Strict colocation splits by construction; ESLint `max-lines` + `dharness/max-file-lines` are the deterministic gate |
| R-11 | The panel is treated as a route and flagged for a missing `ROUTE_MARKERS` entry | Low | Low | It is a **tab inside `/settings`**, an existing route, not a new one. Recorded so `sdd-verify` reads its absence as correct (CLAUDE.md #18b) |
| R-12 | Boundary crossing count rises | Low | Low | D5 keeps it at 12 by placing the panel in `shared/keyboard/ui/`. Verify with `bun --cwd="frontend" run fallow ...` per `docs/fallow-usage.md` |

---

## 9. Rollback Plan

**Behaviour reverts to shipped defaults the moment overrides stop being read.** Nothing about the
registry, the dispatcher's guards, the scope stack or the help dialog depends on an override
existing — an empty `overrides` makes `resolveKeymap` an identity function over the command array.

| Level | Action | Residue |
|---|---|---|
| Disable for one user, no deploy | Reset to defaults in the panel, or clear the row (`SetKeymap("")`) | None. Shipped chords return immediately |
| Kill the feature, keep the code | Remove the `use-keymap-overrides` mount and the `PREFERENCES_ROUTE_TABS` entry | Dead code, zero behaviour change. Stored documents are ignored, not destroyed |
| Slice 62e / 62d | `git revert` | Editing and then the panel disappear; the seam stays inert with empty overrides |
| Slice 62c | `git revert` | Dispatcher and overlay return to reading `KEYBOARD_COMMANDS` directly. `SCOPED_COMMAND_BINDINGS` reverts with it, so `use-notification-keyboard-scope.ts` must be reverted in the **same** commit — the one revert with a coupling |
| Slice 62b | `git revert` | The `app_settings` row is orphaned, never deleted. Harmless: `Get` treats a missing row as unset and nothing else reads `keyboard.keymap` |
| Whole change | `git revert` in reverse slice order | **None.** No schema migration, no wire contract, no dependency, no data to migrate. A leftover `keyboard.keymap` row is inert |

---

## 10. Dependencies

- **Hard ordering dependency on SDD-61** — it must be applied *and archived* first (§6.1, R-1).
- `zustand` (installed, ADR-006), `@heroui/react` (installed), `react-router` (installed).
- **No new npm package, no new Go module.** `package.json` is never hand-edited.
- `app_settings` already exists (`internal/sync/schema_tables.go`); **no migration**.
- Wails bindings must be regenerated locally before the frontend typechecks (§7).

---

## 11. Success Criteria

- [ ] "Settings → Shortcuts" exists, and the **complete** shortcut map — including the scoped
      `notification-center.mark-all-read` binding — is the **first** block on the panel.
- [ ] No floating `?` button and no per-screen hint is added anywhere. `sdd-verify` reports this as
      a positive finding, not an omission.
- [ ] A rebound chord takes effect in the dispatcher **and** the `?` overlay, proven by one test
      that sets an override and asserts both.
- [ ] `Ctrl+1` can be bound to `/today`, and `Alt+1` then does nothing — the switch is genuinely the
      user's. The shipped default is still `Alt+<digit>`.
- [ ] Binding a chord already claimed in the same scope is refused and names the colliding command;
      a scoped chord shadowing a global one is *warned*, not refused.
- [ ] Recording a chord never triggers a shortcut: `?` and `alt+1` fired into the capture control
      run no command.
- [ ] Reset-to-defaults and per-binding revert both work **by pointer alone**, and restore the
      shipped keymap exactly.
- [ ] A garbage, wrong-version, or unknown-id keymap document degrades to shipped defaults, with no
      crash and no partial application.
- [ ] An override for a deleted command id never resurrects a command and is not deleted on read.
- [ ] `Alt+R` still fires only while the Notification Center is mounted, and its chord now comes
      from `SCOPED_COMMAND_BINDINGS`.
- [ ] No Go file parses a chord. No new boundary crossing (`fallow` count stays 12).
- [ ] `docs/openapi.yaml`, the mobile sync contract and the SQLite schema are untouched — reported
      as a positive finding.
- [ ] ADR-019's remapping claim is corrected, ADR-020 exists, the `keyboard-shortcuts` skill and
      CLAUDE.md note 23 are updated, and one learning-log line was appended via
      `node scripts/log-lesson.mjs`.
- [ ] Every slice's commit passes the full pre-commit gate (~90s for Go + frontend; allow
      `git commit` >= 300 000 ms). Mutation: `test:mutation:staged` on frontend lines; `ditto staged`
      with `--test-command "go test -count=1 -json ./internal/settings/"` (and `./internal/desktop/`)
      on the Go slice — the owning package named, never `./...`.

---

## 12. Assumptions a User Might Want to Correct

`execution_mode=auto` and CLAUDE.md #1 require this workflow to run without pausing, so these were
decided from evidence rather than asked. Each is a spec-level amendment, not a re-exploration.

1. **The new tab is appended last** (Downloads, Backup, Startup, **Shortcuts**). D1 constrains order
   *inside* the panel — the user said the map "just needs to be first in the keymap customization
   section" — and said nothing about tab order. `PREFERENCES_ROUTE_TABS` array order is tab order
   (`PreferencesRoute.tsx:21,30`), so moving it is a one-line change.
2. **Scoped chords become remappable** (D6). Assumption: a map that omits `Alt+R` is worse than one
   extra constant, and centralizing one command now is cheaper than centralizing it after the panel
   shipped claiming coverage it did not have.
3. **The shipped default stays `Alt+<digit>`** (D4). Assumption: handing over the switch serves the
   stated preference without pushing a Chromium-zoom collision onto every install.
4. **Capture is by listening, not by selection** (D7). Assumption: reusing `normalizeChord` beats a
   second, hand-maintained key enumeration.
5. **The keymap stays machine-local and out of backups** (§2.2, §6.4). Assumption: the existing
   deliberate `app_settings` exclusion is a decision to respect, not a gap to fix in this change.
6. **Risky chords are labelled, not blocked** (D9). Assumption: blocking a chord nobody has proven
   is swallowed would be inventing evidence; `Alt+<digit>` delivery in the packaged app is still
   unverified and that verification stays a human task.
