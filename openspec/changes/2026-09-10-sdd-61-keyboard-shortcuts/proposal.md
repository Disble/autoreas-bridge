# Proposal: Keyboard Shortcuts Infrastructure (SDD-61)

Change: `2026-09-10-sdd-61-keyboard-shortcuts`
Exploration input: Engram `sdd/2026-09-10-sdd-61-keyboard-shortcuts/explore` (observation #9275)
Delivery: `execution_mode=auto`, `artifact_store=openspec`, `delivery_strategy=single-pr`, `review_budget_lines=400`, `strict_tdd: true`.

> **Size-budget note.** This exceeds the generic 450-word proposal default. `openspec/config.yaml` `rules.proposal` requires a rollback plan and identified affected modules, and the orchestrator required an explicit line-budget forecast. Content is carried in tables rather than prose to keep it scannable.

---

## 1. Intent

Bridge has **zero keyboard handling in production today** — explore confirmed 0 `onKeyDown`/`keydown` hits outside library internals. Every one of the 10 destinations in the rail requires a pointer, and so does every action on them. For a desktop workspace a user lives in daily, that is a real cost.

The trap is the obvious fix. Binding `key -> callback` per surface (the `react-hotkeys-hook` shape) makes the first three shortcuts cheap and every later question unanswerable: there is no list to render in a help dialog, no way to detect that two surfaces claimed the same chord, and no seam a remapping UI or a command palette could ever attach to. A keystroke is an **exact lookup**, not a broadcast — so the data structure should be a map, and the conflicts should be a test-time assertion rather than a bug report.

**Success**: a user reaches any of the 10 routes and the Notification Center's bulk action from the keyboard; a help dialog lists every binding because it reads the same registry the dispatcher reads; and a duplicate binding fails the suite instead of shipping.

---

## 2. Scope

### 2.1 In Scope

| # | Deliverable |
|---|---|
| S-1 | **Command registry** — a declarative `readonly CommandDefinition[]` (id, scope, chord, label, section, `enabled()`, `run()`), shaped after the existing `APP_LAYOUT_NAV_GROUPS` / `PREFERENCES_ROUTE_TABS` constant tables |
| S-2 | **Chord normalization** — pure `KeyboardEvent -> canonical chord string`, plus the inverse `chord -> display string` the help dialog renders |
| S-3 | **Conflict detection** — a pure duplicate-`{scope, chord}` finder, asserted over the shipped keymap as a **test**, not a runtime check |
| S-4 | **Scope stack** — a vanilla zustand store (D4) holding the active scope, readable via `.getState()` from outside React |
| S-5 | **One global dispatcher** — a single `window.addEventListener('keydown')` mounted once, resolving `{activeScope, chord} -> command` and running it |
| S-6 | **Global navigation commands** — one per route in `APP_LAYOUT_NAV_GROUPS` (**10**, not 9 — see §6 drift) |
| S-7 | **"Mark all as read"** — a **route-scoped** command reusing `useNotificationMarkAllRead`, the first real consumer of the scope stack (§4.2) |
| S-8 | **Shortcuts help dialog** — HeroUI `Modal` rendering the registry grouped by section, so discoverability cannot drift from behaviour |

### 2.2 Out of Scope

| Deferred | Why |
|---|---|
| Command palette | D2 — line budget. The registry is its prerequisite and is built here |
| Per-surface deep commands (table row nav, season-board duplicate/remove, per-feature search focus) | D2 — line budget |
| Keymap persistence / remapping UI | D2. `internal/settings/store.go`'s generic `app_settings` Get/Set already suffices when it lands; no backend work is needed now |
| **Multi-key sequences** (`g` then `t`) | Needs a pending-prefix state machine plus a timeout — a *second* state machine on top of the scope stack. SDD-61 ships single chords only. The registry's chord field is a string, so sequences are additive later |
| **Wails menu accelerators** (D3) | Verified: Wails v2.15.0 `options.App` has no `KeyBindings` (v3-only) and no OS-global hotkey API; the only Wails-owned surface is `pkg/menu`, and `internal/desktop/options.go` sets no `Menu:`. Bridge is a tray app (`StartHidden: true`, `HideWindowOnClose: true`), so a visible Windows menu bar is a UX regression for a feature needing no OS-global hotkey. **Door left open**: a menu accelerator would later reach the *same* registry via `runtime.EventsEmit` -> dispatcher (ADR-016, "one gate, more than one door") |
| Keyboard drag on the dnd-kit ordering boards (D6) | `OrderingBoard`, `AnimeScheduleOrdering`, `HosterPriorityEditor` use `@dnd-kit/react` with pointer sensors and **no** `KeyboardSensor` (0 hits for `KeyboardSensor\|PointerSensor\|sensors` in `frontend/src`), after `react-aria-components`' `useDragAndDrop` was removed repo-wide on 2026-08-01. Their lack of keyboard drag is a **pre-existing accessibility gap**, not a collision this change creates. Out of scope — and MUST NOT be claimed as fixed |
| Any Go, REST, WebSocket, or SQLite change | Frontend-only. `docs/openapi.yaml` and the mobile sync contract are untouched |

---

## 3. Capabilities

> Contract with `sdd-spec`. Names researched against `openspec/specs/` (34 spec files, listed 2026-09-10).

### New Capabilities

- `keyboard-shortcuts`: the command registry contract (shape, scope, uniqueness); chord normalization and display formatting; the single-dispatcher rule and its four bail conditions; the scope stack's push/pop lifecycle; the shipped global and route-scoped bindings; and the help dialog's obligation to render the registry rather than a hand-maintained list.

### Modified Capabilities

- **None.**

### Explicitly NOT modified

- `desktop-navigation` (`openspec/specs/desktop-navigation/spec.md`): no nav item is added or removed, no route changes, the `<h1>`-equals-label contract is untouched. A shortcut to `/today` is a second door to an unchanged gate. Its `Scenario: Item count` **is** stale (§6) but that delta is already owned by the unarchived SDD-60 change — SDD-61 MUST NOT duplicate or contradict it.
- `openapi` / `mobile-sync-contract`: zero wire surface added.

---

## 4. Approach

### 4.1 Pattern (D1) — Registry + one dispatcher + scope stack

| Alternative | Verdict |
|---|---|
| **Registry + single dispatcher + scope stack** | **Chosen.** Exact lookup over a map; the registry is simultaneously the dispatch table, the help-dialog data source, and the conflict-detection input |
| Chain of Responsibility over handlers | **Rejected.** A keystroke is an exact lookup, not an "is this mine?" question. CoR makes a duplicate binding *undetectable* — whichever handler is earlier in the chain silently wins. A map makes it a test-time assertion |
| `key -> callback` direct binding (react-hotkeys-hook style) | **Rejected.** Forfeits remapping, the help dialog, conflict detection, and a future command palette. Cheap for three shortcuts, a dead end at ten |

### 4.2 Scope stack is vanilla zustand, not React Context (D4)

The decisive reason is mechanical, not stylistic: the dispatcher is a plain `window.addEventListener('keydown', ...)` callback running **outside React's render cycle**, so it must read the active scope from a non-component context. Context has no read-outside-a-Provider escape hatch; a vanilla zustand store's `.getState()` does.

The precedent is exact and verified in-tree — `frontend/src/shared/store/notification-store/`:

- `notification-store.constants.ts:11` — `createStore<T>()` from `zustand/vanilla`
- `use-notification-store.ts:9` — `useStore(notificationStore, selector)` is the React binding

It also carries a **file-shape constraint** SDD-61 must honour, stated in that file's own comment: the store instance lives in `.constants.ts` because `dharness/role-file-shape` reserves `.helpers` for functions. (ADR-006 independently holds: zero `createContext` usage exists anywhere in `frontend/src`.)

**First consumer.** `useNotificationMarkAllRead` takes `{ source, rows, onMutated }` and its own doc comment states "all" is bounded by the rows the master list has loaded — there is no bulk-all Go binding. So a *global* mark-all-read command would be dishonest. It is registered under the Notification Center's scope, active only while that panel is mounted. That is not a workaround: it means the scope stack ships with a real consumer instead of as unproven infrastructure.

### 4.3 Dispatcher guards (D5)

HeroUI v3 wraps React Aria internally (`react-aria-components` is no longer a direct dependency but still ships transitively via `@heroui/react`). React Aria's handlers `preventDefault` the keys they own, so **no per-widget scope push is needed** for the 31 files using `Table`/`Tabs`/`Modal`/`Select`. The dispatcher bails on:

1. `event.defaultPrevented` — React Aria already claimed it
2. target is `input`, `textarea`, or `contenteditable` — the user is typing
3. `event.isComposing` — IME composition in progress
4. no command matches `{activeScope, chord}`

Each guard gets its own named test **and is mutation-tested**. This is precisely the class CLAUDE.md #16 warns about: a test that still passes with the guard deleted proves nothing, and three such tests have already been caught in this repo.

### 4.4 Mount

`KeyboardDispatcherListener` mounts beside `NotificationNavigationListener` at `AppLayout.tsx:24` — same shape (renders nothing, lives *inside* the layout because it needs the router context `useNavigate` requires). One mount, one listener, cleanup on unmount.

---

## 5. Line Budget — the honest forecast

`delivery_strategy=single-pr` against `review_budget_lines=400`. Estimate under ADR-015 strict colocation (separate `.types.ts` / `.constants.ts` / `.helpers.ts` / `use-*.ts` / `__tests__/` per module) and mandatory JSDoc on **all** declarations:

| Module | Est. authored lines |
|---|---|
| `shared/keyboard/` — types, constants (store + scope ids), helpers, dispatcher hook, scope hook, keymap | ~330 |
| `shared/keyboard/__tests__/` — helpers, registry uniqueness, dispatcher guards | ~270 |
| `shared/keyboard/ui/ShortcutsHelpDialog/` + tests | ~265 |
| `app/KeyboardDispatcherListener.tsx`, `AppLayout.tsx` edit, Notification Center scope wiring + tests | ~95 |
| **Total** | **~960** |

**This lands at roughly 2.4x the 400-line budget.** Stated plainly rather than absorbed by quietly cutting S-7 or S-8, because scope reduction is the user's call, not this phase's.

Per `sdd-phase-common.md` §E the decision belongs at the `sdd-tasks` forecast gate. Two exits, both legitimate:

- **A (recommended)** — pre-declared **2 slices**: **61a** = S-1..S-6 (registry, chords, conflicts, scope store, dispatcher, 10 nav commands, ~600 lines, ships working shortcuts); **61b** = S-7 + S-8 (mark-all-read scope consumer + help dialog, ~360 lines). Each is independently mergeable and leaves the app working. Mirrors SDD-60's pre-declared 3a/3b split.
- **B** — accept a `size:exception` and keep one PR at ~960 lines.

`sdd-tasks` MUST emit the §E guard lines and MUST NOT let `sdd-apply` start until one exit is resolved.

---

## 6. Codebase Drift Recorded (CLAUDE.md #2 — the code wins)

`openspec/specs/desktop-navigation/spec.md:11,23` requires **exactly 9** nav items. `frontend/src/shared/navigation/app-layout.constants.ts:18-46` ships **10** — SDD-60 added `{ to: '/notifications', label: 'Notifications' }` to the SYSTEM group (line 42). The reconciling delta exists at `openspec/changes/2026-08-23-sdd-60-notification-center/specs/desktop-navigation/spec.md` but that change is **unarchived**, so the main spec is stale.

**Consequence for SDD-61**: S-6 targets **10** routes, sourced from the constant, not from the spec. SDD-61 neither fixes nor re-asserts the item count.

---

## 7. Affected Areas

| Area | Impact | Description |
|---|---|---|
| `frontend/src/shared/keyboard/` | **New** | `keyboard.types.ts`, `keyboard.constants.ts` (vanilla scope store + scope ids), `keyboard.helpers.ts` (normalize / format / lookup / find-duplicates), `use-keyboard-dispatcher.ts`, `use-keyboard-scope.ts`, `command-registry.constants.ts`, `__tests__/`. **No `index.ts` barrel** (ADR-011); imported by concrete path. Shared infrastructure, so `shared/<domain>/` not `features/` (CLAUDE.md frontend constraint 12b) |
| `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/` | **New** | HeroUI `Modal`; dumb `.tsx` + `use-*.ts` + `*.helpers.ts` + `*.types.ts` + `__tests__/` (ADR-015) |
| `frontend/src/app/KeyboardDispatcherListener.tsx` | **New** | Renders nothing. Mirrors `frontend/src/app/NotificationNavigationListener.tsx` |
| `frontend/src/app/AppLayout/AppLayout.tsx` | **Modified** | One line beside `<NotificationNavigationListener />` (line 24). Composition only — no state, no hooks, no business logic |
| `frontend/src/features/notifications/ui/NotificationCenterPanel/` | **Modified** | Pushes its scope while mounted and registers the mark-all-read command. `use-notification-mark-all-read.ts` itself is **unchanged** |
| `openspec/specs/keyboard-shortcuts/spec.md` | **New at archive** | From the change's delta spec |
| `docs/learning-log.md` | **Appended** | Via `node scripts/log-lesson.mjs` only, never by hand (CLAUDE.md #17) |
| Go / REST / WS / SQLite | **Untouched** | Zero backend surface |

---

## 8. Risks

| # | Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|---|
| R-1 | ~960 authored lines against a 400-line budget under `single-pr` | **High** | **High** | §5: pre-declared 2-slice split (recommended) or explicit `size:exception`. `sdd-tasks` MUST forecast and gate |
| R-2 | A shortcut fires while the user is typing into a `SearchField`, silently navigating away mid-search | Medium | **High** | §4.3 guards 2 and 3, each with a named test, each mutation-tested (`ditto staged` is not applicable — frontend mutation runs automatically via `test:mutation:staged` on staged lines) |
| R-3 | `event.key` vs `event.code`: digit chords break on layouts where digits need Shift; `event.key` breaks layout-independence, `event.code` breaks mnemonic letters | Medium | Medium | Design-phase decision, flagged here so it is not defaulted into. Normalization is a **pure helper**, so the choice is one function and its table-driven test |
| R-4 | React Aria coexistence assumed rather than proven; a HeroUI `Table` or `Select` swallows or double-handles a chord | Medium | Medium | D5 reasons from React Aria's `preventDefault` contract. The obligation is a test rendering a real HeroUI `Table`/`Select` in jsdom and asserting the dispatcher does not fire — **asserted, not assumed** |
| R-5 | The global listener leaks or double-binds under React 19 StrictMode double-invocation | Medium | Medium | Single mount + cleanup; a test asserting `removeEventListener` is called with the same reference on unmount |
| R-6 | SDD-60 coupling: S-7 depends on shipped `NotificationCenterPanel` code whose specs are unarchived | Low | Medium | Depend on the **code** (CLAUDE.md #2). §3 declares `desktop-navigation` not modified so the two changes cannot collide at archive; §6 records the drift |
| R-7 | The dnd-kit keyboard-drag gap gets read as in-scope and "fixed", or worse, claimed fixed | Low | Medium | §2.2 names it explicitly as pre-existing and out of scope. `sdd-verify` MUST NOT report it as a regression |
| R-8 | `frontend-render-smoke` / `ROUTE_MARKERS` flagged as missing | Low | Low | The help dialog is an **overlay, not a route** — no `ROUTE_MARKERS` entry is owed (CLAUDE.md #18b covers routes). Recorded so `sdd-verify` reports its absence as correct, not as an omission |
| R-9 | A file crosses the 500-line hard fail | Low | Low | Strict colocation splits by construction; ESLint `max-lines` + `dharness/max-file-lines` are the deterministic gate |
| R-10 | A duplicate binding ships | Low | Medium | S-3's uniqueness assertion over the shipped keymap array. Test-time, not runtime — mechanical, not editorial |

---

## 9. Rollback Plan

**The kill switch is one line.** Delete `<KeyboardDispatcherListener />` from `AppLayout.tsx` and every shortcut goes inert. Nothing else changes behaviour, because **no existing component is modified to depend on the registry** — the Notification Center's scope push is additive, `use-notification-mark-all-read.ts` is untouched, and every command's `run()` calls a path that already exists and is already reachable by pointer.

| Level | Action | Residue |
|---|---|---|
| Disable, keep code | Remove the one mount line | Dead code, zero behaviour change |
| Slice 61b | `git revert` | Help dialog and mark-all-read command disappear; nav shortcuts keep working |
| Slice 61a / whole change | `git revert` in reverse order | **None.** Frontend-only, additive, no schema, no wire contract, no dependency, no data migration to undo |

---

## 10. Dependencies

- `zustand` — installed, already the only shared-state mechanism (ADR-006).
- `@heroui/react` `Modal` — installed.
- `react-router` `useNavigate` — installed.
- **No new npm package.** `package.json` is not hand-edited in any case.
- **No Go dependency, no Wails API dependency** (D3: Wails v2.15.0 offers nothing usable here).

---

## 11. Success Criteria

- [ ] Every route in `APP_LAYOUT_NAV_GROUPS` (**10**) is reachable by a single chord, proven by a test that derives its cases **from the constant** so adding an 11th nav item fails the suite until it is bound or explicitly exempted.
- [ ] Two registry entries sharing `{scope, chord}` fail the suite.
- [ ] The dispatcher does **not** fire when: `defaultPrevented` is set; focus is in an `input`/`textarea`/`contenteditable`; an IME composition is active. One named test each, all three surviving mutation.
- [ ] A real HeroUI `Table` and `Select` rendered in jsdom do not lose their own key handling, and do not double-trigger a command.
- [ ] The help dialog's contents are **derived from the registry** — a test proving a newly registered command appears without touching the dialog.
- [ ] "Mark all as read" fires only while the Notification Center scope is active, and is absent from the global scope.
- [ ] Exactly one `keydown` listener is bound, and it is removed on unmount.
- [ ] `docs/openapi.yaml`, the mobile sync contract, and all Go packages are untouched — reported by `sdd-verify` as a positive finding.
- [ ] The commit passes the full pre-commit gate (frontend-only, so well under ~90s; still allow `git commit` >= 300 000 ms).

---

## 12. Assumptions a User Might Want to Correct

`execution_mode=auto` and CLAUDE.md project note #1 require this workflow to run without pausing, so these were decided from evidence rather than asked. Each is a spec-level amendment, not a re-exploration.

1. **Single chords only, no `g`-then-`t` sequences.** Assumption: a prefix state machine plus timeout is not worth the budget when the registry makes sequences additive later.
2. **Mark-all-read is route-scoped, not global.** Assumption: a global command that silently means "all *loaded*" is worse than one that only exists where "loaded" is visible.
3. **No per-widget scope pushes for HeroUI/React Aria.** Assumption: `defaultPrevented` is sufficient (D5). R-4 makes this a proof obligation rather than an article of faith.
4. **The 10-route drift is recorded, not fixed.** Assumption: SDD-60's pending delta owns the item count; two changes amending the same scenario is the worse failure.
