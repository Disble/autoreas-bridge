# Tasks: Keyboard Shortcuts Infrastructure (SDD-61)

Change: `2026-09-10-sdd-61-keyboard-shortcuts`
Inputs: `proposal.md` (Engram #9277), `design.md` (Engram #9281), `specs/keyboard-shortcuts/spec.md`
(Engram #9279) — **7 requirements, 14 scenarios**, every one cited against the task that proves it.

> **Drift note (CLAUDE.md #2 — code/artifact wins, drift recorded rather than silently absorbed).**
> The orchestrator's launch brief for this phase states "8 requirements, 14 scenarios." The shipped
> `specs/keyboard-shortcuts/spec.md` has exactly **7** `### Requirement:` headings totalling **14**
> scenarios (2+2+3+3+1+2+1). The scenario count matches; the requirement count in the brief does not.
> This document plans against the spec file as the authority, not the brief's paraphrase.

> **Slice-count override (the deliverable this phase was asked to measure).** `proposal.md` forecast
> ~960 authored lines and proposed a 2-slice split (61a ≈ 600, 61b ≈ 360) — already rejected by the
> orchestrator as leaving 61a ~1.5x over the 400-line session budget. This phase's own file-by-file
> forecast below (§ Review Workload Forecast) lands at **~1,550–1,650** total authored lines once
> mandatory JSDoc, strict-TDD test volume, and the two named proof obligations (R-4 React-Aria
> coexistence, WebView2 manual check) are counted per file — the proposal's ~960 figure was
> production-leaning and under-counted tests, consistent with this repo's own measured ratio ("tests
> are roughly half or more of a shared module's authored lines," per the orchestrator's brief, citing
> `shared/store/notification-store/` and `shared/ordering/`). Enforcing the "no slice over ~500 lines"
> ceiling against that total requires **4** slices, not 3: `1,600 / 500 ≈ 3.2`, rounded up. The 4-slice
> split below follows the architecture's own natural seams (pure primitives → registry + dispatcher
> algorithm → React wiring → help dialog UI) and lands every slice at 390–460 lines — comfortably under
> the 500 ceiling with margin, rather than 3 slices forced to hug it. No scope was cut to hit a number
> (`chained-pr` skill's hard rule).

---

## Task-Planning Notes (read before Slice 1)

**A. `AppLayout.tsx` is touched twice, deliberately, across two different slices.** Slice 3 (task 3.2.7)
adds `<KeyboardDispatcherListener />` beside the existing `<NotificationNavigationListener />` at line
24. Slice 4 (task 4.2.3) adds `<ShortcutsHelpDialog />` beside it. This mirrors `design.md` §8's
rollback note ("the kill switch is now **two** lines... rather than one") and is stated once here so
it is not mistaken for a merge conflict or a missed diff when reviewing Slice 4.

**B. Pre-verified facts are cited, not re-verified.** `design.md` already establishes, with file/line
evidence, that: React 18 attaches at `#root` so a bubble-phase `window` listener observes
`defaultPrevented` already set (D5); `<React.StrictMode>` wraps the app so pop-by-id (not pop-last) is
required (D10); `.dharness/fallow.jsonc:66-67` allows `features -> shared` but not `shared -> features`;
and HeroUI's `ModalRoot` maps `state` to `{isOpen, onOpenChange}` with no trigger button required
(`@heroui/react/dist/components/modal/modal.js:19-40`). Tasks below cite these decisions by their `D#`
label rather than re-deriving them.

**C. Scope resolution (spec Requirement 3) is proven across two slices, honestly split.** The scenario
"Popping a scope restores the previous scope" has a store-mechanics half (does the frame stack pop the
right frame?) and a command-resolution half (does the NEXT keystroke actually resolve to the global
command afterward?). Slice 1 proves the first half with `keyboard-scope.helpers.test.ts` (no
`resolveCommand` exists yet); Slice 2 proves the full scenario once `resolveCommand` exists. Both tasks
say so explicitly rather than one silently claiming full coverage early.

**D. Threat Matrix: N/A.** `design.md` §7 records zero routing/shell/subprocess/VCS/process-integration
surface for this change (`navigate(to)` only ever receives a compile-time constant). No threat-matrix
RED tasks are owed.

---

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | ~1,550–1,650 across the whole chain (four slices, see per-slice table) |
| 400-line budget risk | High (against the session's `review_budget_lines=400`) |
| Chained PRs recommended | Yes |
| Suggested split | Four chained PRs (Slice 1 → 2 → 3 → 4), each independently shippable |
| Delivery strategy | `auto-chain` |
| Chain strategy | `stacked-to-main` — resolved to this repo's trunk-for-work, `dev` (CLAUDE.md #19b: `main` is deploy-only, never receives development commits directly). Each slice's PR merges into `dev` in order; no tracker branch |

```text
Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High
```

`auto-chain` resolves `Decision needed before apply` to `No`: the chain strategy (`stacked-to-main`) was
already cached at session start, so `sdd-apply` proceeds directly with Slice 1, no additional user
decision required before starting.

### Per-Slice Line Forecast

| Slice | Forecast (lines) | Over 500? | Runtime harness | Rollback boundary |
|---|---|---|---|---|
| 1. Chord + scope-store primitives | 390–420 | No | `bun --cwd="frontend" run test -- keyboard` | `git revert`; every new file unreferenced |
| 2. Command registry + dispatcher algorithm | 430–460 | No | `bun --cwd="frontend" run test -- keyboard` | `git revert`; `KEYBOARD_COMMANDS`/`dispatchKeyboardEvent` still unreferenced by any mounted component |
| 3. React wiring (dispatcher, scope hook, Notification Center scope) | 390–420 | No | `bun --cwd="frontend" run test -- keyboard notification` + `bun --cwd="frontend" run render:smoke` | `git revert`, OR delete `<KeyboardDispatcherListener />` from `AppLayout.tsx` alone (one-line kill switch, `proposal.md` §9) |
| 4. Shortcuts help dialog + ADR + WebView2 verification | 330–360 | No | `bun --cwd="frontend" run test -- keyboard` + manual `wails build` check | `git revert`; `?` still sets `isHelpOpen` inertly, matching pre-Slice-4 state |

**No slice is forecast over 500.** All four sit in the 330–460 range, most within the 200–400 sweet
spot the phase brief asked for.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Chord normalization + vanilla scope-stack store, invisible to the app | PR 1 | `bun --cwd="frontend" run test -- chord.helpers` | `bun --cwd="frontend" run test -- keyboard` | `git revert`; inert new files |
| 2 | Command registry (10 nav + help) + the dispatcher algorithm, unit-tested, not yet mounted | PR 2 | `bun --cwd="frontend" run test -- dispatch.helpers` | `bun --cwd="frontend" run test -- keyboard` | `git revert`; no mounted consumer |
| 3 | Dispatcher goes live: nav shortcuts fire, mark-all-read is route-scoped | PR 3 | `bun --cwd="frontend" run test -- use-keyboard-dispatcher` | `bun --cwd="frontend" run render:smoke` | `git revert` or delete the one `AppLayout.tsx` line |
| 4 | Help dialog renders from the registry; ADR; manual WebView2 check | PR 4 | `bun --cwd="frontend" run test -- ShortcutsHelpDialog` | Manual `wails build` + `Alt+<digit>` check | `git revert`; overlay unreachable, chords still inert to nothing user-visible breaking |

---

## Slice 1 — Chord Normalization + Scope Store Primitives

**Leaves the app working because:** every file is new and unreferenced; nothing outside
`frontend/src/shared/keyboard/` imports any of it yet.
**Forecast:** 390–420 lines. Requirements covered: **2** (fully), **3** (store-mechanics half of one
scenario, per Note C).

### 1.1 Infrastructure

- [x] **1.1.1** [GREEN] Create `frontend/src/shared/keyboard/keyboard.types.ts`: `Chord`,
  `KeyboardScope`, `CommandSection`, `CommandContext`, `CommandDefinition`, `KeyboardScopeFrame`,
  `KeyboardStoreState`, verbatim from `design.md` §5, every declaration JSDoc'd (CLAUDE.md frontend
  #6). No RED: a type-only file has no runtime behavior to fail first.
- [x] **1.1.2** [GREEN] Create `frontend/src/shared/keyboard/keyboard.constants.ts`: `keyboardStore`
  via `createStore()` from `zustand/vanilla` (initial `{ frames: [], isHelpOpen: false }`),
  `KEYBOARD_SCOPE`, `CHORD_MODIFIER_ORDER` (`ctrl+alt+shift+meta+<key>` per D8). Mirrors
  `notification-store.constants.ts:11` exactly — store instance lives in `.constants.ts` because
  `dharness/role-file-shape` reserves `.helpers` for functions (D4). Also holds
  `MODIFIER_ONLY_KEYS`/`DIGIT_CODE_PATTERN`/`NUMPAD_CODE_PATTERN` — moved here from
  `chord.helpers.ts` after `dharness/role-file-shape` rejected plain `const` values in a `.helpers.ts`
  file (see Deviations in the apply report).
- [x] **1.1.3** [GREEN] [[BUILT IN SLICE 4 -- see below]] Create `frontend/src/shared/keyboard/use-keyboard-store.ts`:
  `useKeyboardStore` wrapping `useStore(keyboardStore, selector)`, mirroring `use-notification-store.ts`
  verbatim (D4). **Written in Slice 1 and removed before its commit**: `fallow audit` rejected it as an
  unreachable file with no consumer, and suppressing that would have gamed the gate. Landed for real in
  Slice 4 with `ShortcutsHelpDialog` as its first real consumer (subscribes reactively to `isHelpOpen`)
  plus a colocated `__tests__/use-keyboard-store.test.ts`. `KEYBOARD_SCOPE` stayed out: nothing in this
  change imports it, so it was left unshipped rather than planted for a future consumer.

### 1.2 Implementation

- [x] **1.2.1** [RED] Write `frontend/src/shared/keyboard/__tests__/chord.helpers.test.ts`: a
  table-driven case for `normalizeChord` — Ctrl+K → one canonical chord string (spec **S3**);
  `Alt+1` on a US layout (`code:'Digit1'`) vs AZERTY (`code:'Digit1', key:'&'`) both → `alt+1`;
  `Shift+/` and `Shift+,` both → `?`; `Alt+Shift+R` → `alt+shift+r`, distinct from `alt+r`; a bare
  `Shift` press alone → `null`; `Numpad1` → NOT `'1'`. Plus a `formatChord` round-trip for the Ctrl+K
  case (spec **S4**). Design D7, D8. Two extra cases added post-MUTATE (Shift+digit-row, a synthetic
  multi-char non-alphabetic token) to kill two surviving mutants — see apply report.
- [x] **1.2.2** [GREEN] Implement `frontend/src/shared/keyboard/chord.helpers.ts`:
  `normalizeChord(event): Chord | null` (digit-row positional escape hatch first, modifier-alone
  returns `null`, then named key, then single printable char, with shift-suppression per D7) and
  `formatChord(chord): string`. Satisfies spec "Chord Normalization And Display Formatting Are Pure
  Functions" (**S3**, **S4**).
- [x] **1.2.3** [RED] Write `frontend/src/shared/keyboard/__tests__/keyboard-scope.helpers.test.ts`:
  pushing a frame then popping it restores the prior top-of-stack (spec **S5**, store-mechanics half —
  see Note C); popping by `id` out of order removes only that frame; a double pop on the same `id` is a
  no-op (D10); `setKeyboardHelpOpen(true)` flips `isHelpOpen`; `resetKeyboardStore()` returns the store
  to its initial shape.
- [x] **1.2.4** [GREEN] Implement `frontend/src/shared/keyboard/keyboard-scope.helpers.ts`:
  `pushKeyboardScopeFrame`, `popKeyboardScopeFrame` (filters by `id`, D10 — never pop-last),
  `getKeyboardState`, `setKeyboardHelpOpen`, `resetKeyboardStore` (test-only reset every later suite
  touching `keyboardStore` will import).

### 1.3 Testing & Verification

- [x] **1.3.1** [MUTATE] Ran manually pre-commit (staged files, `bun --cwd="frontend" run
  test:mutation:staged`) rather than waiting for the `lefthook.yml` commit-time hook, since apply does
  not commit. First run: `chord.helpers.ts` 90.91% with 3 survived + 2 no-coverage mutants (the D7
  digit+shift branch and the `isSingleNonAlphabetic` length guard, exactly the two branches this task
  names); `use-keyboard-store.ts` 0% (2 no-coverage, matching the untested `use-notification-store.ts`
  precedent — outside this task's named scope). Hand-added two test cases plus a `formatChord` REFACTOR
  (the length-based ternary was provably redundant for single-char parts) to kill every named-branch
  mutant. Second run: `chord.helpers.ts` 100.00%/100.00%, 51 killed, 0 survived, 0 no-coverage. Overall
  repo-blended score 81.64% ≥ 80% threshold, exit 0. Files left staged for the orchestrator's commit.
- [x] **1.3.2** [VERIFY] `bun --cwd="frontend" run test -- keyboard`: 2 files, 17 tests, 0 failures.
  `git status --porcelain` confirms only `frontend/src/shared/keyboard/**` changed (7 new files, all
  `A`); `bun run typecheck` and `eslint` over the 7 files are both clean.
- [x] **1.3.3** [GATE] `git commit` — done by the orchestrator as `19da42e`, full pre-commit gate green. First attempt was REJECTED by `fallow audit` (unused file `use-keyboard-store.ts`, unused export `KEYBOARD_SCOPE`); both were removed rather than suppressed, and task 1.1.3 was re-opened as deferred.
  **Left to the orchestrator** — apply does not run `git commit` (CLAUDE.md #3/#4).

**Rollback:** `git revert` the slice commit. Every new file is unreferenced by the rest of the app.

---

## Slice 2 — Command Registry + Dispatcher Algorithm

**Leaves the app working because:** `KEYBOARD_COMMANDS` and `dispatchKeyboardEvent` exist and are
fully unit-tested, but nothing calls `dispatchKeyboardEvent` from a real `keydown` listener yet
(Slice 3 wires that).
**Forecast:** 430–460 lines. Requirements covered: **1** (fully), **3** (fully, completing Note C),
**4** (guard logic, minus the R-4 real-render proof, which is Slice 3's), **5** (fully).

### 2.1 Infrastructure

- [x] **2.1.1** [RED] Write `frontend/src/shared/keyboard/__tests__/registry.helpers.test.ts`:
  `findDuplicateBindings` returns an empty array over two non-conflicting entries, and returns BOTH
  conflicting command ids over a seeded duplicate `{scope, chord}` pair (non-vacuous — design §6).
  `findDuplicateCommandIds` mirrors the same empty/seeded-duplicate shape for `id`. Also added two
  cases for `buildNavigationCommands` (assigned-chord case + omitted-unassigned-route case) beyond the
  task's literal list, since strict TDD's "no production code before a failing test" rule otherwise
  had no RED for that function ahead of 2.1.2 — see Deviations in the apply report.
- [x] **2.1.2** [GREEN] Implement `frontend/src/shared/keyboard/registry.helpers.ts`:
  `buildNavigationCommands(navGroups, chordsByPath)`, `findDuplicateBindings(commands)`,
  `findDuplicateCommandIds(commands)`.

### 2.2 Implementation

- [x] **2.2.1** [RED] Write `frontend/src/shared/keyboard/__tests__/command-registry.constants.test.ts`:
  derive expected commands from `APP_LAYOUT_NAV_GROUPS` via `flattenNavItems` rather than hand-listing
  them — every one of the 10 routes has exactly one bound global command in `KEYBOARD_COMMANDS`, and
  `command.run({ navigate: spy })` calls `spy` with that route's `to` (spec **S11**; an 11th nav item
  added later must fail this suite, per spec's own wording). Also assert, over the REAL shipped array,
  `findDuplicateBindings(KEYBOARD_COMMANDS)` is empty (spec **S1**) and every entry declares a
  non-empty `section` (spec **S2**). Added a fourth case proving the `?` help command actually flips
  `isHelpOpen` when run, not just that it exists.
- [x] **2.2.2** [GREEN] Implement `frontend/src/shared/keyboard/command-registry.constants.ts`:
  `NAV_COMMAND_CHORDS` (`Readonly<Record<string, Chord>>`, `alt+1`…`alt+9`, `alt+0` mapped to the 10
  routes in `flattenNavItems(APP_LAYOUT_NAV_GROUPS)` order, per design's shipped keymap table) and
  `KEYBOARD_COMMANDS` (`buildNavigationCommands(...)` spread plus the `?` → open-help command, which
  calls `setKeyboardHelpOpen(true)` from `keyboard-scope.helpers.ts`). `NAV_COMMAND_CHORDS` is
  hand-listed data, not derived from list position — deliberate, so an 11th nav item with no entry
  here yields no chord rather than a bogus computed `alt+11` (design §9).
- [x] **2.2.3** [RED] Write `frontend/src/shared/keyboard/__tests__/dispatch.helpers.test.ts` —
  **one named test per guard**, each asserting the matched command's `run` was NOT called:
  `event.defaultPrevented === true`; `event.isComposing === true` (spec **S10**); focus target is
  `input`/`textarea`/`[contenteditable]` (spec **S9**); an unbound chord with no matching command
  (spec **S6**, unclaimed chord falls back to global then is still absent there). Plus: a scoped
  command shadows a global one sharing the same chord and does NOT fall through to global when its
  `enabled()` is `false` (spec **S7**, D9); popping the scoped frame and re-dispatching the same chord
  resolves the global command instead (spec **S5**, full proof completing Note C). `event.repeat` is
  asserted to NOT bail dispatch (D12 — explicitly not a fifth guard). Also added: direct `isTypingTarget`
  and `resolveCommand` unit tests (same strict-TDD reasoning as 2.1.1 — design calls both
  "unit-testable without rendering" and exporting them with no direct test would be a dead export
  under `fallow audit`), a positive dispatch case (bound chord actually navigates + calls
  `preventDefault`), and a null-chord bail case (a bare modifier press) added post-MUTATE.
- [x] **2.2.4** [GREEN] Implement `frontend/src/shared/keyboard/dispatch.helpers.ts`:
  `isTypingTarget(target)`, `resolveCommand(chord, frames, commands)` (top-down frame walk, first
  frame declaring the chord wins, D9), `dispatchKeyboardEvent(event, context)` (the 9-step algorithm
  from design §3, reading `keyboardStore.getState().frames`). `isTypingTarget`'s target parameter is a
  structurally-narrowed `TypingTargetLike` (mirrors `ChordSourceEvent`'s pattern), not `EventTarget`,
  because this test file runs in Vitest's `node` project (`*.helpers.test.ts` under `shared/**`) with
  no jsdom — see Deviations.

### 2.3 Testing & Verification

- [x] **2.3.1** [MUTATE] Ran manually (staged files, `bun --cwd="frontend" run test:mutation:staged`)
  since apply does not commit and `lefthook.yml` only fires on commit. First run over the whole staged
  diff: repo-blended 82.37% (pass), but isolating the four Slice 2 production files (targeted
  `stryker run --mutate <ranges> --reporters clear-text,json`) surfaced 6 survived + 1 no-coverage
  mutant Stryker's summary table hid inside the repo-blended average: (1) `dispatch.helpers.ts` —
  `chord === null` guard both survived and had a no-coverage block (no test dispatched an event that
  normalizes to no chord); `tagName !== undefined && ...` survived (the guard is redundant at runtime
  since `Set.has(undefined)` is already `false` — TS requires it only for `Set<string>.has()`'s
  parameter type); the `getAttribute?.()` optional-chaining survived (no test exercised a target with
  no `getAttribute` at all). (2) `registry.helpers.ts` — three survivors on the `id` template literal
  (empty string, widened regex, replacement-string swap), because no test asserted the exact `id`
  value `buildNavigationCommands` produces. Fixed: widened `TYPING_TAG_NAMES` to
  `ReadonlySet<string | undefined>` so the redundant `tagName !== undefined` check could be deleted
  outright (mutation-tdd's "simplify first"); replaced `.replace(/^\//, '')` with `.slice(1)` in
  `registry.helpers.ts` (every real `to` starts with `/`, so the regex added nothing but mutation
  surface); added a null-chord dispatch test, a missing-`getAttribute` `isTypingTarget` test, and an
  exact-`id` assertion. The one true equivalent mutant left (`chord === null`'s guard is
  runtime-redundant with the `command === null` guard right after it, since no `CommandDefinition`
  ever has a `null` chord, but TS still requires the narrowing to call `resolveCommand`) is disposed
  with a narrow `// Stryker disable next-line ConditionalExpression,BlockStatement: <reason>` comment
  at that exact line, following the existing repo convention in `history-table.helpers.ts:107`.
  Second run: all four production files 100.00%/100.00%, 93 killed, 0 survived, 0 no-coverage.
  Repo-blended re-run: 82.69% ≥ 80% threshold, exit 0. The named guard-ordering and D9 fall-through
  mutants are both covered by name: D9's is the explicit S7 test above; the guard-ordering concern
  (`isTypingTarget` ahead of `defaultPrevented`) has no observable difference to test against, since
  both are pure early-returns with no side effects between them — Stryker's mutators (which mutate
  expressions, not statement order) surfaced nothing here, consistent with that being a true
  order-independent equivalence rather than an untested branch.
- [x] **2.3.2** [VERIFY] Ran `bun --cwd="frontend" run test -- keyboard`: 5 files, 49 tests, 0
  failures (17 from Slice 1 + 32 new). `bun run typecheck` clean. `bunx eslint` over all 7
  created/modified files clean (role-file-shape, require-jsdoc, no findings). Confirmed the boundary:
  `grep -rn "from '.*features" src/shared/keyboard/` — zero hits, exit 1.
- [x] **2.3.3** [GATE] `git commit` — done by the orchestrator as `6d3cba6`, full pre-commit gate green on the first attempt. `NAV_COMMAND_CHORDS` was made module-private before committing, pre-empting the slice-1 dead-code rejection.
  **Left to the orchestrator** — apply does not run `git commit` (CLAUDE.md #3/#4).

**Rollback:** `git revert`. `KEYBOARD_COMMANDS` and `dispatchKeyboardEvent` remain unreferenced by any
mounted component.

---

## Slice 3 — React Wiring: Dispatcher, Scope Hook, Notification Center Scope

**Leaves the app working because:** shortcuts go LIVE — `Alt+1`…`Alt+0` navigate, `Alt+R` marks all
as read while the Notification Center is mounted — with no help dialog yet (`?` sets `isHelpOpen`, but
nothing renders it until Slice 4).
**Forecast:** 390–420 lines. **Actual: 514 authored lines** (`git diff --cached --stat` over the 10
touched/created files), inside the ledger's 800-line cap with margin — see the apply report's
Deviations for the extra strict-TDD tests (`use-keyboard-scope.test.ts`, plus shape/re-render
assertions added to `use-notification-keyboard-scope.test.ts`) the forecast did not itemize.
Requirements covered: **4** (completed — R-4 real-render proof), **6** (fully).

### 3.1 Infrastructure

- [x] **3.1.1** [GREEN] Create `frontend/src/shared/keyboard/use-keyboard-dispatcher.ts`: one
  `window.addEventListener('keydown', handler)` bound in a `useEffect` with an empty dependency array,
  removed on cleanup with the SAME function reference (spec "Exactly One Global Dispatcher" MUST
  clause). `navigate` is read through a `navigateRef` refreshed every render (mirrors
  `use-notification-navigation.ts`'s own `navigateRef`, including its documented BOUNDARY: no test
  pins the refresh, since every command's `run` calls `navigate(to)` with a compile-time absolute
  route today).
- [x] **3.1.2** [GREEN] Create `frontend/src/shared/keyboard/use-keyboard-scope.ts`: `commandsRef`
  refreshed every render (`useLayoutEffect`), `pushKeyboardScopeFrame({ id, scope, getCommands: () =>
  commandsRef.current })` pushed exactly once (`useEffect`, deps `[frameId, scope]` — `frameId` added
  to satisfy exhaustive-deps since it's read inside the effect; stable for the mount's lifetime so
  behaviorally identical to the task's literal `[scope]`), `popKeyboardScopeFrame(id)` on cleanup (D10,
  design §3 "Scope stack lifecycle"). Frame ids come from a module-scoped monotonic counter
  (`useState(createKeyboardScopeFrameId)`, called once per mount).

### 3.2 Implementation

- [x] **3.2.1** [RED] Write `frontend/src/shared/keyboard/__tests__/use-keyboard-dispatcher.test.ts`:
  exactly one `keydown` listener bound (`vi.spyOn(window, 'addEventListener')`); unmount calls
  `removeEventListener` with the identical function reference `addEventListener` received; survives
  React 19 `<React.StrictMode>` double-invocation without leaking a second listener (R-5). Built with
  `createElement` rather than JSX since the file is `.ts`, not `.tsx`, per the task's own filename.
- [x] **3.2.2** [RED] Write
  `frontend/src/shared/keyboard/ui/KeyboardDispatcherListener/__tests__/KeyboardDispatcherListener.react-aria.test.tsx`
  [[MANDATORY R-4 PROOF OBLIGATION — NEVER REDUCE TO A MOCKED EVENT]]: mount
  `KeyboardDispatcherListener` alongside a REAL HeroUI `Table` and an open `Select`; fire a real
  `keydown` a widget owns (its own arrow-key/typeahead handling) with focus inside it; assert the
  widget's own behavior fires exactly once (no double-trigger) and no `KEYBOARD_COMMANDS` entry runs
  for that chord (spec **S8**; D5's stated proof obligation, asserted here, never assumed). Both cases
  push a GLOBAL test-only command bound to the exact chord the widget is about to claim (`arrowdown` /
  `escape`) rather than relying on a shipped `KEYBOARD_COMMANDS` entry sharing that chord by
  coincidence — this is what makes the assertion prove the `defaultPrevented` guard's mechanism rather
  than an accident of the registry's current contents. Table: real `ArrowDown` row navigation, verified
  via `document.activeElement` AND the native `dispatchEvent` return value (`false` = cancelled). Select:
  real `Escape` closing an open popover, same double assertion. A third case (added post-MUTATE, see
  Deviations) proves the dispatcher is not merely inert: a real unclaimed `Alt+1` press reaches a real
  navigation, so the two guard proofs above are not vacuous.
- [x] **3.2.3** [GREEN] Create
  `frontend/src/shared/keyboard/ui/KeyboardDispatcherListener/KeyboardDispatcherListener.tsx`: renders
  `null`, calls `useKeyboardDispatcher()` inside router context (D11 — concrete-path import, no `app/`
  re-export seam).
- [x] **3.2.4** [RED] Write
  `frontend/src/features/notifications/ui/NotificationCenterPanel/__tests__/use-notification-keyboard-scope.test.ts`:
  mounting the hook with `canMarkAllRead: true` mounted, dispatching `alt+r` invokes `onMarkAllRead`
  (spec **S12**); unmounting the hook then dispatching the same chord invokes nothing at the global
  scope (spec **S13**); `canMarkAllRead: false` swallows the chord without invoking `onMarkAllRead`
  (D9). Two cases added post-MUTATE (see Deviations): the pushed command's exact shape (id/scope/chord/
  label/section) and that `canMarkAllRead`/`onMarkAllRead` updates across a re-render actually reach the
  running command instead of closing over the first render forever.
- [x] **3.2.5** [GREEN] Create
  `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-keyboard-scope.ts`:
  calls `useKeyboardScope({ scope: 'notification-center', commands: [...] })` with one command
  (`id: 'notification-center.mark-all-read'`, `chord: 'alt+r'`, `section: 'Notifications'`,
  `enabled: () => canMarkAllRead`, `run: () => onMarkAllRead()`), taking `canMarkAllRead`/
  `onMarkAllRead` as parameters. Modify
  `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-center-panel.ts`:
  one import + one call to the new hook, passing the already-destructured `canMarkAllRead`/
  `onMarkAllRead` from `useNotificationMarkAllRead` (line 102). `use-notification-mark-all-read.ts`
  itself stays untouched (design §4).
- [x] **3.2.6** [GREEN] Modify `frontend/src/app/AppLayout/AppLayout.tsx`: add
  `<KeyboardDispatcherListener />` beside the existing `<NotificationNavigationListener />` at line 24,
  imported by concrete path from `shared/keyboard/ui/KeyboardDispatcherListener/KeyboardDispatcherListener`
  (D11). First of this change's two `AppLayout.tsx` touches — see Task-Planning Note A.

### 3.3 Testing & Verification

- [x] **3.3.1** [MUTATE] `test:mutation:staged` over the Slice 3 staged diff (dispatcher hook, scope
  hook, notification scope). Confirm the "pop by id vs pop-last" mutant stays KILLED under this slice's
  real mount/unmount cycle; hand-mutate if Stryker reports it uncovered here. First isolated run
  (`stryker run --mutate <4-file-ranges> --reporters clear-text,json`, same technique Slice 2 used since
  the repo-blended `test:mutation:staged` summary hides per-file survivor detail) surfaced 15 survived
  mutants the repo-blended pass (82.13%, already above threshold) hid: `use-notification-keyboard-scope.ts`
  6 (exact `id`/`scope`/`label`/`section` string literals never asserted, `useMemo` deps array), 
  `use-keyboard-scope.ts` 4 (frame-id counter body/increment, `useLayoutEffect` refresh body, push
  effect's `[frameId, scope]` deps), `use-keyboard-dispatcher.ts` 4 (`navigateRef` refresh effect body,
  `handleKeyDown` body, its context object literal, the mount effect's `[]` deps), `KeyboardDispatcherListener.tsx`
  1 (whole component body — the two R-4 tests alone don't prove the dispatcher fires when NOTHING
  blocks it, only that it doesn't misfire when something does). Fixed with new tests: a dedicated
  `use-keyboard-scope.test.ts` (deviation, see below) proving frame push/pop, two concurrently-mounted
  consumers get distinct sequential ids, `commandsRef`/scope-change re-render behavior; two new cases in
  `use-notification-keyboard-scope.test.ts` (exact command shape, re-render reactivity); one new case in
  `KeyboardDispatcherListener.react-aria.test.tsx` (real unclaimed `Alt+1` → real navigation). Two
  survivors accepted as documented, not force-tested: `use-keyboard-dispatcher.ts`'s `navigateRef`
  refresh effect (BOUNDARY comment, identical reasoning to `use-notification-navigation.ts`'s own
  precedent — every command's route is a compile-time absolute constant today) and its mount effect's
  `[]` deps array (a genuine equivalent mutant — ANY constant array produces identical
  once-per-mount scheduling; unlike the `chord === null` and `months > 1` precedents, a
  `// Stryker disable next-line` comment does NOT suppress it here because the target is a trailing call
  argument, not a leading statement, so Stryker's comment scanner does not associate with it — documented
  in a plain, non-directive comment instead of one falsely claiming to suppress it). Second isolated run:
  93.94% (31 killed / 2 accepted survivors of 33 covered), all four files at 100% except
  `use-keyboard-dispatcher.ts` at 77.78% (7/9, the two accepted survivors). Files left staged for the
  orchestrator's commit.
- [x] **3.3.2** [VERIFY] Run `bun --cwd="frontend" run test -- keyboard notification` and
  `bun --cwd="frontend" run render:smoke` (confirm no existing route regresses; the help overlay owes
  no `ROUTE_MARKERS` entry — design §6, it is an overlay, not a route). 78 test files / 554 tests green
  (keyboard, notification, AppLayout, and full `App.test.tsx` route suite — the latter now exercises
  every route with `KeyboardDispatcherListener` mounted). `render:smoke` clean. `tsc --noEmit` and
  `eslint` over the full touched surface both clean. Boundary confirmed:
  `grep -rn "from '.*features" frontend/src/shared/keyboard/` — zero hits, exit 1.
- [x] **3.3.3** [GATE] `git commit` — done by the orchestrator as `af08b4e`, full pre-commit gate green on the first attempt.
  **Left to the orchestrator** — apply does not run `git commit` (CLAUDE.md #3/#4).

**Rollback:** `git revert`, OR delete the one `<KeyboardDispatcherListener />` line from
`AppLayout.tsx` without reverting — both are valid per `proposal.md` §9's one-line kill switch.

---

## Slice 4 — Shortcuts Help Dialog + ADR + Final Verification

**Leaves the app working because:** this is the last slice; `?` has set `isHelpOpen` since Slice 2,
and this slice is the first to render it.
**Forecast:** 330–360 lines. **Actual: ~543 authored lines** (`git diff --cached --stat` over the 10
touched/created production+test+ADR files, excluding the `tasks.md`/`learning-log.md` process lines) —
consistent with the orchestrator's bottom-up re-estimate (502–708) and with the same under-forecast
pattern Slices 2–3 already measured (the original per-slice table under-counted strict-TDD test volume
and, here, the ADR itself). Inside the ledger's 800-line cap with clear margin. Requirements covered:
**7** (fully).

### 4.1 Infrastructure

- [x] **4.1.1** [GREEN] Create
  `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/shortcuts-help-dialog.types.ts`: the hook's
  return shape and the dialog's props, every property `readonly` (CLAUDE.md frontend #5). No RED: a
  type-only file has no runtime behavior to fail first (same reasoning as 1.1.1).

### 4.2 Implementation

- [x] **4.2.1** [RED] Write
  `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/__tests__/ShortcutsHelpDialog.test.tsx`: every
  `KEYBOARD_COMMANDS` label appears under its `section`; an injected command supplied through the
  dialog's `commands` prop (defaulting to `KEYBOARD_COMMANDS`) appears with NO change to the dialog's
  own code (spec **S14**); a mounted scope frame's command appears and disappears once the frame is
  popped (Notification Center's own hook already proves push/pop in Slice 3 — this test drives the
  frame primitive directly rather than mounting `use-notification-keyboard-scope`, so the dialog's own
  derivation is proven independent of that feature); the overlay closes when `useLocation().pathname`
  changes. One case added post-implementation (see Deviations): dismissing the dialog (Escape) flips
  `isHelpOpen` back to `false` in the store — the RED file initially left `onOpenChange`'s body
  uncovered, and MUTATE caught it.
- [x] **4.2.2** [GREEN] Implement
  `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/shortcuts-help-dialog.helpers.ts`
  (`toShortcutSections`, grouping by `section` with `display: formatChord(chord)`),
  `use-shortcuts-help-dialog.ts` (`{ isOpen, onOpenChange, sections }`, closes on a genuine route
  change), and `ShortcutsHelpDialog.tsx` (`Modal`/`Modal.Backdrop`/`Modal.Container`/`Modal.Dialog`/
  `Modal.Header`/`Modal.Heading`/`Modal.Body`, no trigger button — the keystroke IS the trigger, per
  the verified `ModalRoot` prop mapping design §5 cites against the installed package, the same
  controlled-`isOpen` shape `AnimeDetailMutationControls.tsx` already ships). Also created
  `frontend/src/shared/keyboard/use-keyboard-store.ts` (task 1.1.3, deferred from Slice 1) with a
  colocated `__tests__/use-keyboard-store.test.ts` — its first real consumer.
- [x] **4.2.3** [GREEN] Modify `frontend/src/app/AppLayout/AppLayout.tsx`: add
  `<ShortcutsHelpDialog />` beside `<KeyboardDispatcherListener />`. Second of this change's two
  `AppLayout.tsx` touches — see Task-Planning Note A.
- [x] **4.2.4** [GREEN] Create `docs/adr/019-keyboard-command-registry.md` (161 lines): condenses D1
  (registry-as-data over Chain-of-Responsibility/direct-binding), D4 (vanilla zustand over React
  Context), D5 (bubble-phase `window` listener, the React Aria coexistence contract), D7
  (`event.key`-first chord normalization with the digit-row escape hatch), per design §2.

### 4.3 Testing & Verification

- [x] **4.3.1** [MUTATE] Ran manually (staged files, `bun --cwd="frontend" run test:mutation:staged`,
  repo-blended 83.01% ≥ 80% threshold, exit 0) since apply does not commit and `lefthook.yml` only
  fires on commit. Isolating the four Slice 4 production files (targeted `stryker run --mutate
  <4-file-ranges> --reporters clear-text,json`, same technique Slices 2–3 used) surfaced 3 mutants the
  repo-blended average hid: (1) `shortcuts-help-dialog.helpers.ts` — a `?? []` fallback on a `Map.get`
  lookup was no-coverage because every key read back was one just written in the same loop, so the
  fallback was unreachable by construction. Fixed by REFACTOR: dropped the parallel order-array +
  fallback lookup entirely and iterate the `Map`'s own insertion order instead (mutation-tdd's
  "simplify first" — same move Slice 2 made replacing a regex with `.slice()`). (2)
  `use-shortcuts-help-dialog.ts` — the `onOpenChange` callback's body was no-coverage (nothing in the
  RED file closed the dialog from the inside); fixed with the Escape-dismissal test added to 4.2.1
  above. (3) `use-shortcuts-help-dialog.ts` — the same callback's `useCallback` deps array (`[]`)
  survived; accepted as a true equivalent mutant and documented in place, identical reasoning to
  `use-keyboard-dispatcher.ts`'s mount-effect deps array in Slice 3 (a constant array, mutated or not,
  produces the same memoized-forever callback, and nothing here observes callback identity — only what
  calling it does; a `// Stryker disable` comment does not reach it for the same reason as that
  precedent, since the target is a trailing call argument, not a leading statement). Second isolated
  run: 96.97% (32 killed / 1 accepted survivor of 33 covered), all four files at 100% except
  `use-shortcuts-help-dialog.ts` at 94.12% (16/17, the one accepted survivor). Files left staged for
  the orchestrator's commit.
- [x] **4.3.2** [VERIFY] Ran `bun --cwd="frontend" run test -- keyboard notification`: 69 test files /
  509 tests green. `bun --cwd="frontend" run typecheck` and `bunx eslint` over every touched file both
  clean. `bun --cwd="frontend" run render:smoke` clean. `go test ./...` (repo root): every package
  green, confirming zero backend files touched across the whole four-slice chain (design §7, zero
  Go/REST/WS/SQLite surface). Boundary confirmed: `grep -rn "from '.*features" frontend/src/shared/keyboard/`
  — zero hits, exit 1.
- [x] **4.3.3** [VERIFY] [[MANDATORY WEBVIEW2 MANUAL CHECK — sdd-verify obligation, design §9, open
  question]] `wails build`, launch the packaged app, and manually confirm `Alt+1` through `Alt+0` reach
  the page rather than being swallowed as a Windows system chord. jsdom cannot prove this — do not
  infer a result from the green suite. If any chord is swallowed, the fix is a one-line
  `NAV_COMMAND_CHORDS` data change (e.g. `alt+shift+<digit>`), not a code change (chords are data by
  design). Record the pass/fail result, and the chosen chord if changed, explicitly in the
  `sdd-verify` report. **RESULT: PASS, 2026-09-11.** Validated by the repository owner in the packaged app and
  attested in conversation; the orchestrator did not observe the keypresses and records the
  owner as the evidence source. No chord was changed, so `NAV_COMMAND_CHORDS` ships as
  authored. A screenshot independently corroborates the scope machinery: the help overlay
  listed `Mark all as read` under NOTIFICATIONS, which only renders while the Notification
  Center has pushed its frame. Scope widened during verification: the obligation was written
  as `Alt+1`..`Alt+0`, but **11 of the 12 shipped chords are `alt+`** (ten navigation plus
  `alt+r`) and Windows treats Alt as the menu-mnemonic modifier, so the real question was the
  whole `alt+` family rather than the digit row. `?` was already proven earlier the same day.
- [x] **4.3.4** [GATE] Lesson half done: appended one lesson via `node scripts/log-lesson.mjs` — a
  mount-time effect closing an overlay on `[pathname]` fires on first mount too (no prior value to
  compare), which silently closed the help dialog the instant it mounted even when a caller had just
  set `isHelpOpen` to `true`; fixed with a ref holding the previous pathname, only acting on a genuine
  change. Chosen over the three suggested candidates (D5, D7, the Stryker-comment-scoping finding)
  because it is the one that actually cost cycles in this slice: a real production bug strict TDD
  caught before it shipped, not a fact already recorded in a prior slice's Learned section or in
  design.md itself. `git commit` half (full pre-commit gate, ≥300 000 ms timeout, never `--no-verify`)
  **done as `2d4af42`** by the orchestrator, plus `e8ecdce` for the lesson. The first three
  attempts were rejected by a pre-existing contention defect outside this change: `tsc` sat in
  lefthook`s cheap-checks group and starved the vitest suite it ran beside, so two
  `*.windowing.test.tsx` rails that measure 454ms standalone inflated past Vitest`s 5s budget.
  Both timeout escapes are `no-restricted-syntax` errors in `frontend/eslint.config.js`, which
  names contention as a root cause to fix rather than absorb; the linter refused the first fix
  attempt and was right to. Resolved in its own commit `0350712` by moving typecheck into the
  frontend lane. apply does not run `git commit` (CLAUDE.md #3/#4).

**Rollback:** `git revert`. `?` still sets `isHelpOpen` inertly, matching the pre-Slice-4 state — no
user-visible regression from reverting this slice alone.

---

## Requirement → Task Coverage Matrix

| Spec Requirement | Scenarios | Closed by |
|---|---|---|
| 1. Command Registry Is Typed, Duplicate-Free | S1, S2 | 2.2.1 |
| 2. Chord Normalization And Display Formatting Are Pure | S3, S4 | 1.2.1–1.2.2 |
| 3. Scope Stack Resolves Innermost-First, Gated By `enabled()` | S5, S6, S7 | 1.2.3–1.2.4 (partial S5), 2.2.3–2.2.4 (full S5, S6, S7) |
| 4. Exactly One Global Dispatcher Bails On Four Guards | S8, S9, S10 | 2.2.3–2.2.4 (S9, S10), 3.2.2 (S8) |
| 5. Ten Global Navigation Commands Derived From Nav Constant | S11 | 2.2.1–2.2.2 |
| 6. "Mark All As Read" Route-Scoped To Notification Center | S12, S13 | 3.2.4–3.2.5 |
| 7. Shortcuts Help Dialog Renders From The Registry | S14 | 4.2.1–4.2.2 |

## Conventions Applied Throughout (not repeated per task)

- Mandatory JSDoc on every declaration, including private ones (CLAUDE.md frontend #6).
- Every `*Props` interface property `readonly` (CLAUDE.md frontend #5).
- No `index.ts` barrels; concrete-path imports only (ADR-011, D11).
- Strict colocation: `__tests__/` sits beside the files it tests (`shared/keyboard/__tests__/` for the
  flat helper/hook layer, `ui/**/__tests__/**` per component).
- Every implementation task follows RED → GREEN → MUTATE → REFACTOR (CLAUDE.md #16); MUTATE on the
  frontend is automatic via `lefthook.yml`'s `test:mutation:staged`, not a separate invocation.
- No file in this change approaches 400 effective lines; the largest is `dispatch.helpers.ts` at
  ~120 (design §4).
