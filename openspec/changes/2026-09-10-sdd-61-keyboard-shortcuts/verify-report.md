# Verify Report — SDD-61 Keyboard Shortcuts

**Verdict: PASS.** All 39 tasks closed, all 7 requirements backed by tests that fail if the behaviour regresses, and the one obligation no test could discharge — WebView2 chord delivery — was validated in the packaged app and is recorded below with its evidence source named.

Verified by the orchestrating agent directly, not delegated (CLAUDE.md #3).

## Evidence

| Check | Result |
|---|---|
| Frontend suite | **2525 passed / 2525**, 281 files |
| Subsystem suite (`keyboard`, `ShortcutsHelp`, `KeyboardDispatcher`, notification scope) | **73 passed / 73**, 11 files |
| `tsc --noEmit` | clean |
| `go test ./...` | clean — and zero `.go` files were touched across the whole chain (`git diff c170acf..HEAD -- '*.go'` is empty) |
| ESLint | clean on every file this change added |
| `render:smoke` | clean |
| Mutation (isolated, per slice) | 100% on slice 1–2 production files; 93.94% slice 3; 96.97% slice 4. Three survivors accepted, each documented in source as an equivalent mutant |
| Orphan value exports | none — checked per export against its importers, the rule that cost slice 1 a commit |

## Requirements → what proves them

| Requirement | Proof |
|---|---|
| The registry is a typed, duplicate-free source of truth | `command-registry.constants.test.ts` runs `findDuplicateBindings` over the **real shipped array**, not a fixture, and asserts every entry declares a non-empty `section` |
| Chord normalization and formatting are pure functions | `chord.helpers.test.ts`, 11 cases including the AZERTY digit-row and `Shift+/` → `?` cross-layout equivalences. 100% mutation score |
| The scope stack resolves innermost-first, gated by `enabled()` | `keyboard-scope.helpers.test.ts` proves frame mechanics; `dispatch.helpers.test.ts` proves the resolution half, including that a disabled scoped command **swallows** the chord rather than falling through to global |
| Exactly one global dispatcher, bailing on four guards | `use-keyboard-dispatcher.test.ts` asserts one listener, removal with the identical function reference, and survival of StrictMode double-invocation. `dispatch.helpers.test.ts` has one named test per guard |
| Ten global navigation commands derived from the nav constant | `command-registry.constants.test.ts` derives its expectations from `APP_LAYOUT_NAV_GROUPS` via `flattenNavItems`, deliberately inverting the repo's usual rule so an eleventh route fails the suite until someone assigns it a chord |
| "Mark all as read" is route-scoped, never global | `use-notification-keyboard-scope.test.ts` proves it fires while mounted, does nothing at global scope once unmounted, and is swallowed when `canMarkAllRead` is false |
| The help dialog renders content derived from the registry | `ShortcutsHelpDialog.test.tsx` injects a command through the `commands` prop and asserts it appears **with no change to the dialog's own code** |

### The R-4 proof obligation, discharged

The design rests on the claim that React Aria calls `preventDefault` on keys it owns, so a bubble-phase `window` listener observes `defaultPrevented` already set. That claim was explicitly written as a proof obligation rather than an assumption, and `KeyboardDispatcherListener.react-aria.test.tsx` discharges it: it pushes a probe command bound to the **exact chord** a real HeroUI `Table` (`ArrowDown`) and open `Select` (`Escape`) claims, then asserts three things together — that `dispatchEvent` returned `false`, which happens only when `preventDefault` ran; that the widget's own behaviour still fired; and that the probe never ran. A third case fires a real unclaimed `Alt+1` and asserts the router landed on `/today`, because the two negative cases would pass unchanged against a dispatcher that did nothing at all.

## WebView2 manual check (task 4.3.3) — PASS

**Result: PASS, 2026-09-11.** No chord was changed; `NAV_COMMAND_CHORDS` ships as authored.

Evidence source is the repository owner, who validated it in the packaged app and attested it in conversation. The orchestrator did not observe the keypresses and does not claim to have. A screenshot independently corroborates the scope machinery rather than the delivery: the help overlay listed `Mark all as read` under a NOTIFICATIONS section, which renders only while the Notification Center has pushed its frame.

**The obligation's scope was wider than written.** It was authored as `Alt+1`–`Alt+0`, but **11 of the 12 shipped chords are `alt+`** — ten navigation commands plus `alt+r` — and Windows treats Alt as the menu-mnemonic modifier, so the open question was the whole `alt+` family, not the digit row. `?` had already been proven earlier the same day when the owner opened the overlay in the real app.

## Deviations from the plan, and why

| Deviation | Reason |
|---|---|
| Task 1.1.3 (`use-keyboard-store.ts`) was written in slice 1, removed before its commit, and delivered in slice 4 | `fallow audit` rejected it as an unreachable file with no consumer. Suppressing the finding would have gamed the gate; the help dialog is its first real consumer, so it landed there. `KEYBOARD_SCOPE` was dropped for the same reason and never became necessary — scopes are literals of the `KeyboardScope` union |
| `NAV_COMMAND_CHORDS` is module-private, not exported as planned | Same rule, applied pre-emptively in slice 2. Nothing outside its file reads it |
| Four slices instead of the two the proposal suggested | The proposal's own forecast (~960 lines) was production-leaning; the measured total was ~2,050 with tests at roughly half. Re-estimated bottom-up against measured repo comparables |
| One commit outside this change: `0350712` | Three commit attempts were rejected by a pre-existing gate defect — `tsc` sat in lefthook's cheap-checks group and starved the vitest suite beside it, inflating two `*.windowing.test.tsx` rails from 454ms to almost six seconds. Both timeout escapes are `no-restricted-syntax` errors in `frontend/eslint.config.js`, which names contention as a root cause to fix; the linter refused the first fix attempt and was right to. Fixed in its own commit by moving typecheck into the frontend lane |

## What is NOT verified, carried forward

- **A keyboard layout with no Latin letters gets the digit and `?` chords but no letter chords.** Deliberately unshipped; the one-branch fix is recorded in ADR-019 §4, and no affected user is known.
- **Scoped command chords are not remappable.** `use-notification-keyboard-scope.ts` declares `chord: 'alt+r'` inline, so the "keymap is separable from the commands" property holds for navigation commands and not for scoped ones. ADR-019 overstates this and is corrected by SDD-62, which also makes scoped bindings remappable.
- **Customized keymaps will not travel in a backup bundle.** `internal/desktop/app_backup.go:37-41` excludes `app_settings` deliberately. Not a defect of this change; relevant input to SDD-62.

## Commits

| Commit | Slice |
|---|---|
| `b326d3c` | planning artifacts |
| `19da42e` | 1 — chord normalization, scope-frame primitives |
| `6c484c6` | lesson: how fallow judges a sliced commit |
| `6d3cba6` | 2 — command registry, dispatch algorithm |
| `5f56159` | standards: how to size a change from measured comparables |
| `0350712` | gate fix (outside this change's scope) |
| `af08b4e` | 3 — dispatcher bound, shortcuts live |
| `2d4af42` | 4 — help dialog, ADR-019 |
| `e8ecdce` | lesson: tsc starves vitest |
| `1365b49` | docs: skill, CLAUDE.md note 23, CHANGELOG, skills table |

## Next step

`sdd-archive`. SDD-62 has a hard dependency on it: `openspec/specs/keyboard-shortcuts/spec.md` does not exist yet, so SDD-62 cannot write a delta against a main spec that lives only inside this change folder.
