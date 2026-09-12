# Design: Keyboard Shortcuts Infrastructure (SDD-61)

Change: `2026-09-10-sdd-61-keyboard-shortcuts`
Input: `proposal.md` (this directory). Store: `openspec`. `strict_tdd: true`. `review_budget_lines: 400`.

> **Size-budget note.** Over the generic 800-word design default, as `proposal.md` was over its own.
> `openspec/config.yaml` `rules.design` requires sequence diagrams and documented rationale, and the
> phase brief required concrete file paths, type shapes, the dispatcher algorithm, the scope lifecycle
> and the help dialog's derivation. Content is carried in tables and code blocks rather than prose.

---

## 1. Technical Approach

**The registry is data, not closures.** A `CommandDefinition` declares `{ id, scope, chord, label, section, enabled?, run }`, and everything environmental (`navigate`) arrives through a `CommandContext` **at dispatch time**. That single decision is what makes the proposal's three obligations mechanical rather than aspirational:

| Obligation | Why data-not-closures delivers it |
|---|---|
| S-3 conflict detection | `findDuplicateBindings(KEYBOARD_COMMANDS)` is a pure call on a plain array — no render, no hook |
| S-8 help dialog | The dialog reads the same array; it cannot drift because there is nothing else to read |
| S-6 nav coverage test | `run({ navigate: spy })` is callable directly; asserting "Alt+9 goes to `/notifications`" needs no router |

Surface-local behaviour (S-7) cannot be static, so it arrives the other way: a mounted surface **pushes a scope frame** carrying its own commands. One `CommandDefinition` shape, two supply routes, one resolution walk.

Layering is forced by `.dharness/fallow.jsonc` (`shared -> infrastructure` only): `shared/keyboard/` may never import `features/`. Every dependency runs `features -> shared` and `app -> shared`, which is the direction the design already wanted.

---

## 2. Architecture Decisions

### D1 — Command registry + one global dispatcher + scope stack
**Choice**: exact `{scope, chord} -> command` lookup over a declarative array.
**Alternatives**: Chain of Responsibility over handlers; direct `key -> callback` binding.
**Rationale**: settled in `proposal.md` §4.1 and not reopened. A keystroke is an exact lookup; CoR makes a duplicate binding undetectable (the earlier handler silently wins) where a map makes it a test-time assertion. Direct binding forfeits remapping, the help dialog, conflict detection and a future palette.

### D3 — No Wails menu accelerators
**Choice**: none in SDD-61.
**Rationale**: verified in `proposal.md` §2.2 — Wails v2.15.0 `options.App` has no `KeyBindings` (v3-only), no OS-global hotkey API exists, and `internal/desktop/options.go` sets no `Menu:`. Bridge is a tray app (`StartHidden`, `HideWindowOnClose`), so a visible Windows menu bar is a UX regression. Door left open per ADR-016: a menu accelerator would later reach the **same** registry via `runtime.EventsEmit` -> dispatcher.

### D4 — Scope stack is vanilla zustand, not React Context
**Choice**: `createStore()` from `zustand/vanilla` in `keyboard.constants.ts`.
**Alternatives**: React Context; a module-level mutable array.
**Rationale**: the dispatcher is a plain `window.addEventListener('keydown')` callback **outside React's render cycle** and must read state via `.getState()`; Context has no read-outside-a-Provider escape hatch. A bare mutable array would give the help dialog nothing to subscribe to. The in-tree precedent is exact — `shared/store/notification-store/notification-store.constants.ts:11` holds the `createStore()` call **in the constants file** because `dharness/role-file-shape` reserves `.helpers` for functions, paired with a `useStore(store, selector)` wrapper in `use-notification-store.ts:6`. Both shapes are mirrored verbatim. (ADR-006 holds independently: zero `createContext` usages exist in `frontend/src`.)

### D5 — `event.defaultPrevented` is the React Aria coexistence contract
**Choice**: the listener binds on `window` in the **bubble** phase, never capture, and bails on `defaultPrevented`.
**Rationale**: React 18+ attaches its listeners at the root container (`#root`). A native `keydown` reaches `#root` — where React dispatches synthetics and React Aria calls `preventDefault` on keys it owns — *before* it reaches `window`. A bubble-phase window listener therefore observes the flag already set; a capture-phase one would run **first** and the guard would be inert. When nothing is focused the target is `document.body`, outside `#root`, so React never runs and global chords still fire.
**Consequence, stated deliberately**: a focused widget always beats a global shortcut. If a HeroUI `Table` claims `?` for typeahead, help does not open while that table has focus. That is the intended priority order, not a defect.
**Proof obligation** (R-4): asserted by an integration test rendering a real HeroUI `Table` and `Select` in jsdom — never assumed.

### D7 — `event.key` first, with a positional escape hatch for the digit row *(the open fork, now decided)*
**Choice**: `normalizeChord` resolves the key token in this order —
1. `event.code` matching `/^Digit([0-9])$/` -> that digit (**positional**)
2. a modifier key alone (`Shift`/`Control`/`Alt`/`Meta`/`AltGraph`) -> `null`, no chord
3. a named key from `event.key`, lowercased (`escape`, `enter`, `arrowdown`)
4. a single printable character from `event.key`, lowercased

**Shift suppression**: `shift+` is kept for tokens from branches 1 and 4-when-alphabetic, and **dropped** when the token is single, printable and non-alphabetic — because for punctuation the shift is already expressed *in the character*.

**Alternatives**: `event.key` everywhere; `event.code` everywhere.
**Rationale**: the fork only ever existed for the digit row. For every other class `event.key` strictly wins, and the reason is that `event.key` **is** the character: `?` normalizes to `?` from `Shift+/` on US, `Shift+ß` on German and `Shift+,` on AZERTY, all reaching one binding, with no per-layout table. `event.code` would have pinned `?` to one physical key and mistranslated it everywhere else. Digits are the exception because a digit chord means "the *n*-th position", so `Digit1` is the honest identity.

**What this costs on a non-US layout — stated plainly:**

| Layout | Behaviour | Cost |
|---|---|---|
| AZERTY / any shifted-digit layout | `Alt+1` fires from the unshifted `&` key (`code === 'Digit1'`) | The chord **works**, but the help dialog prints `Alt + 1` while the keycap reads `&`. Accepted: firing beats matching the keycap |
| Dvorak / Colemak | Letter chords follow the **character**, not the position | `Alt+R` is wherever `r` is. Correct for a character shortcut; muscle memory differs from QWERTY |
| Numeric keypad | `Numpad1` is not `Digit1` | `Alt+numpad-1` does **not** fire. Documented limitation, not a bug |
| Cyrillic / Greek / non-Latin | `event.key` is non-Latin, so letter chords do **not** fire | The real gap. Deferred, not hidden: the fix is one branch (`event.key` outside ASCII -> `KeyA..KeyZ` from `event.code`) inside the same pure helper. Not shipped because there is **zero evidence** of such a user, and an untested branch for a hypothetical population is speculation |

**The helper is the seam.** Every one of those rows is one `normalizeChord` edit plus table rows — no dispatcher, registry, store or UI change.

### D8 — Modifier grammar and reserved combinations
Canonical order is `ctrl+alt+shift+meta+<key>`; `formatChord` mirrors it. **No shipped chord uses `Ctrl+Alt`**, because Windows reports AltGr as `ctrlKey && altKey` and such a chord would fire while an EU user types ordinary text.

### D9 — Scoped commands shadow global ones and do not fall through
Resolution walks frames top-down and stops at the **first frame that declares the chord**. If that command's `enabled()` is false the dispatcher calls `preventDefault()` and does nothing.
**Rejected**: falling through to the global binding when a scoped command is disabled — pressing `Alt+R` with nothing unread would silently do something *else*, which is worse than doing nothing.

### D10 — Frames are popped by id, and read their commands lazily
A frame is `{ id, scope, getCommands }`. `getCommands` closes over a ref the owning hook refreshes every render, so a frame can never run a stale callback and is pushed exactly **once**. Pop filters by `id`.
**Rejected**: pop-last. Under React 19 StrictMode double-invocation and interleaved mounts, popping the tail can remove somebody else's frame. Filtering by id is order-independent and idempotent.

### D11 — No `app/` re-export seams *(deliberate deviation from `proposal.md` §7)*
`AppLayout` imports `KeyboardDispatcherListener` and `ShortcutsHelpDialog` by **concrete path** from `shared/keyboard/ui/`, as it already does for `NotificationsNavBadge`.
**Rationale**: ADR-011 says import by concrete path; the `app/NotificationToasts.tsx` and `app/NotificationNavigationListener.tsx` seams are one-line historical re-exports. Two more near-empty files add reviewer surface to a change already forecast at ~2.4x its budget. Recorded rather than done silently.

### D12 — Rejected guard: `event.repeat`
Auto-repeat is **not** a bail condition. Navigation to the current route is a react-router no-op and `enabled()` gates the only mutating command. Naming it here so the design does not silently grow a fifth guard the spec does not carry.

---

## 3. Data Flow

```
                      ┌──────────────────────────────────────────┐
  window 'keydown' ──►│ useKeyboardDispatcher  (one mount)        │
   (bubble phase)     │  └─ dispatchKeyboardEvent(event, context) │
                      └────────────┬─────────────────────────────┘
                                   │ reads .getState()
                      ┌────────────▼─────────────┐     pushes/pops frames
                      │   keyboardStore (vanilla)│◄────────────────────────┐
                      │   { frames, isHelpOpen } │                         │
                      └────────────┬─────────────┘              ┌──────────┴──────────┐
                                   │ resolve                    │  useKeyboardScope    │
             ┌─────────────────────▼──────────────────┐         │  (NotificationCenter)│
             │ frames (top-down)  →  KEYBOARD_COMMANDS│         └──────────────────────┘
             └─────────────────────┬──────────────────┘
                                   │ run(context)
                      ┌────────────▼─────────────┐
                      │ navigate(to) | store set │
                      └──────────────────────────┘
                                   ▲ subscribes (useStore)
                      ┌────────────┴─────────────┐
                      │   ShortcutsHelpDialog    │  renders the SAME arrays
                      └──────────────────────────┘
```

### Sequence — one keystroke, end to end (`Alt+9` on the Notifications route)

```
User      window        dispatch.helpers        keyboardStore      command.run
 │ keydown  │                  │                      │                 │
 │─────────►│ handleKeyDown(e) │                      │                 │
 │          │─────────────────►│                      │                 │
 │          │   G1  e.defaultPrevented ──── true ────► return (React Aria owns it)
 │          │   G2  e.isComposing      ──── true ────► return (IME composing)
 │          │   G3  isTypingTarget(e.target) ─ true ─► return (user is typing)
 │          │                  │ normalizeChord(e)    │                 │
 │          │                  │  "alt+9" | null ─ null ► return (modifier key alone)
 │          │                  │ getState().frames    │                 │
 │          │                  │─────────────────────►│                 │
 │          │                  │◄──── frames ─────────│                 │
 │          │   G4  resolveCommand("alt+9", frames, KEYBOARD_COMMANDS)
 │          │                  │        null ─────────► return (unbound chord)
 │          │                  │ command.enabled?() === false
 │          │                  │        ──────────────► e.preventDefault(); return
 │          │                  │ e.preventDefault()   │                 │
 │          │                  │ command.run(context) │────────────────►│
 │          │                  │                      │   navigate('/notifications')
```

### Dispatcher algorithm (normative order)

```
1. bail if event.defaultPrevented               // G1 — React Aria / focused widget claimed it
2. bail if event.isComposing                    // G2 — IME composition in progress
3. bail if isTypingTarget(event.target)         // G3 — input | textarea | [contenteditable] | role="textbox"
4. chord = normalizeChord(event); bail if null  //      modifier key pressed alone
5. frames = keyboardStore.getState().frames     //      read outside React
6. command = resolveCommand(chord, frames, KEYBOARD_COMMANDS)
7. bail if command === null                     // G4 — unbound chord, leave it to the platform
8. if command.enabled?.() === false  -> event.preventDefault(); return   // D9
9. event.preventDefault(); command.run(context)
```

Guards run **before** normalization so the cheap bail is first, and each is a separately named, separately mutated test.

### Scope stack lifecycle

```
mount   ─► useKeyboardScope({ scope, commands })
             commandsRef.current = commands           (useLayoutEffect, every render)
             pushKeyboardScopeFrame({ id, scope, getCommands: () => commandsRef.current })
                                                      (useEffect, deps [scope])
render  ─► commandsRef.current refreshed; frame untouched; no re-push
unmount ─► popKeyboardScopeFrame(id)                  (effect cleanup, filter by id)
```

---

## 4. File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/shared/keyboard/keyboard.types.ts` | Create | `Chord`, `KeyboardScope`, `CommandSection`, `CommandContext`, `CommandDefinition`, `KeyboardScopeFrame`, `KeyboardStoreState` |
| `frontend/src/shared/keyboard/keyboard.constants.ts` | Create | `keyboardStore` (`createStore` from `zustand/vanilla`), `KEYBOARD_SCOPE`, `CHORD_MODIFIER_ORDER` |
| `frontend/src/shared/keyboard/chord.helpers.ts` | Create | `normalizeChord(event): Chord \| null`, `formatChord(chord): string` |
| `frontend/src/shared/keyboard/dispatch.helpers.ts` | Create | `isTypingTarget`, `resolveCommand`, `dispatchKeyboardEvent` — the whole algorithm, unit-testable without rendering |
| `frontend/src/shared/keyboard/registry.helpers.ts` | Create | `buildNavigationCommands`, `findDuplicateBindings`, `findDuplicateCommandIds` |
| `frontend/src/shared/keyboard/keyboard-scope.helpers.ts` | Create | `pushKeyboardScopeFrame`, `popKeyboardScopeFrame`, `getKeyboardState`, `setKeyboardHelpOpen`, `resetKeyboardStore` |
| `frontend/src/shared/keyboard/command-registry.constants.ts` | Create | `NAV_COMMAND_CHORDS`, `KEYBOARD_COMMANDS` |
| `frontend/src/shared/keyboard/use-keyboard-dispatcher.ts` | Create | One `window` listener, bound in an effect, removed on cleanup |
| `frontend/src/shared/keyboard/use-keyboard-scope.ts` | Create | Push/pop lifecycle for a mounted surface |
| `frontend/src/shared/keyboard/use-keyboard-store.ts` | Create | `useStore(keyboardStore, selector)` — mirrors `use-notification-store.ts` |
| `frontend/src/shared/keyboard/ui/KeyboardDispatcherListener/KeyboardDispatcherListener.tsx` | Create | Renders `null`; holds the dispatcher inside router context |
| `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/{ShortcutsHelpDialog.tsx, shortcuts-help-dialog.types.ts, shortcuts-help-dialog.helpers.ts, use-shortcuts-help-dialog.ts}` | Create | HeroUI `Modal`, driven by `isHelpOpen` from the store |
| `frontend/src/shared/keyboard/__tests__/**` + `ui/**/__tests__/**` | Create | Per §6 |
| `frontend/src/app/AppLayout/AppLayout.tsx` | Modify | Two lines beside `<NotificationNavigationListener />` (line 24). Composition only |
| `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-keyboard-scope.ts` | Create | Registers the route-scoped mark-all-read command |
| `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-center-panel.ts` | Modify | One import + one call. **`use-notification-mark-all-read.ts` is untouched** |
| `docs/adr/019-keyboard-command-registry.md` | Create | D1/D4/D5/D7 condensed; the ADR the registry will be read through later |
| `docs/learning-log.md` | Append | Via `node scripts/log-lesson.mjs` only (CLAUDE.md #17) |
| Go / REST / WS / SQLite / `docs/openapi.yaml` | Untouched | Zero backend surface |

**No `index.ts` barrel anywhere** (ADR-011). No file approaches 400 effective lines: the largest is `dispatch.helpers.ts` at ~120 including mandatory JSDoc.

---

## 5. Interfaces / Contracts

```ts
// keyboard.types.ts

/** Canonical chord string: `ctrl+alt+shift+meta+<key>`, e.g. `alt+1`, `alt+shift+r`, `?`. */
export type Chord = string;

/** Which surface a command belongs to. `global` is always resolvable; the rest are stack frames. */
export type KeyboardScope = 'global' | 'notification-center';

/** Help-dialog grouping. Presentation only — it never affects resolution. */
export type CommandSection = 'Navigation' | 'Notifications' | 'Help';

/**
 * Everything environmental a command needs, injected at dispatch time so the
 * registry can stay a plain constant array that tests, the conflict checker and
 * the help dialog all read without rendering anything.
 */
export interface CommandContext {
  readonly navigate: NavigateFunction;
}

/** One binding: what it is called, what claims it, and what it does. */
export interface CommandDefinition {
  readonly id: string;
  readonly scope: KeyboardScope;
  readonly chord: Chord;
  /** Rendered verbatim by the help dialog. Nav labels are reused from `APP_LAYOUT_NAV_GROUPS`. */
  readonly label: string;
  readonly section: CommandSection;
  /** Absent means always enabled. False means the chord is claimed and swallowed (D9). */
  readonly enabled?: () => boolean;
  readonly run: (context: CommandContext) => void;
}

/**
 * A frame on the scope stack. `getCommands` is read lazily at dispatch time so a
 * frame pushed once can never run a stale closure (D10).
 */
export interface KeyboardScopeFrame {
  readonly id: number;
  readonly scope: KeyboardScope;
  readonly getCommands: () => readonly CommandDefinition[];
}

/** Zustand state contract for the shared keyboard read-model. */
export type KeyboardStoreState = {
  /** Innermost frame last. Resolution walks this top-down before falling back to `KEYBOARD_COMMANDS`. */
  readonly frames: readonly KeyboardScopeFrame[];
  /** Whether the shortcuts overlay is showing. It lives here because the `?` command runs outside React. */
  readonly isHelpOpen: boolean;
};
```

### Shipped keymap

| Chord | Scope | Section | Command |
|---|---|---|---|
| `alt+1` … `alt+9`, `alt+0` | `global` | Navigation | The 10 entries of `flattenNavItems(APP_LAYOUT_NAV_GROUPS)` in order: `/today`, `/downloads`, `/editor`, `/catalog`, `/history`, `/season`, `/devices`, `/activity`, `/notifications`, `/settings` |
| `?` | `global` | Help | Open the shortcuts overlay |
| `alt+r` | `notification-center` | Notifications | Mark all as read (`enabled: () => canMarkAllRead`) |

`NAV_COMMAND_CHORDS` is a `Readonly<Record<string, Chord>>` keyed by route path; `buildNavigationCommands` maps `flattenNavItems(...)` over it, so **labels and ids derive from the nav constant** and the rail and the help dialog cannot disagree. An 11th nav item yields an undefined chord, which §6's coverage test rejects — assigning it stays a human decision because there is no 11th digit.

### Help dialog derivation

`use-shortcuts-help-dialog.ts` returns `{ isOpen, onOpenChange, sections }` where `sections = toShortcutSections([...KEYBOARD_COMMANDS, ...activeFrameCommands])`, grouped by `section` with `display: formatChord(chord)`. `ShortcutsHelpDialog.tsx` is dumb: `Modal` / `Modal.Backdrop` / `Modal.Container` / `Modal.Dialog` / `Modal.Header` / `Modal.Heading` / `Modal.Body`, driven by `isOpen` + `onOpenChange` — **verified** against the installed package, where `ModalRoot` spreads its props onto React Aria's `DialogTrigger` and maps `state` to exactly that pair (`@heroui/react/dist/components/modal/modal.js:19-40`). No trigger button exists; the keystroke is the trigger. Escape and backdrop dismissal are React Aria's. The hook closes the overlay on `useLocation().pathname` change, so navigating from inside the overlay does not leave it floating over the new route.

`ShortcutsHelpDialog` accepts an optional `commands` prop defaulting to `KEYBOARD_COMMANDS` — the same injectable-source shape `NotificationNavigationListener` uses for `source` — so §6 can prove derivation with a command the dialog has never heard of.

---

## 6. Testing Strategy

RED first for every row (`strict_tdd: true`). Frontend mutation coverage is automatic: `lefthook.yml` runs `test:mutation:staged` (Stryker, `root: frontend`) over the added lines of staged frontend files. `ditto` is the Go path and does **not** apply here.

| Layer | What to test | Approach |
|---|---|---|
| Unit — `chord.helpers` | Normalization table: `Alt+1` US vs AZERTY (`code: 'Digit1'`, `key: '&'`); `Shift+/` and `Shift+,` both -> `?`; `Alt+Shift+R` -> `alt+shift+r` distinct from `alt+r`; bare `Shift` -> `null`; `Numpad1` -> not `1`. `formatChord` round-trip | Table-driven, synthetic `KeyboardEvent` |
| Unit — `dispatch.helpers` | **One named test per guard**, each asserting the command did **not** run: `defaultPrevented`, `isComposing`, each typing target, unbound chord. Plus `enabled() === false` swallows the chord without running it | Direct calls, spy `run`; **every guard mutation-tested** (CLAUDE.md #16 — a guard test that passes with the guard deleted proves nothing, and three such tests have already shipped here) |
| Unit — `registry.helpers` | `findDuplicateBindings(KEYBOARD_COMMANDS)` is empty, **and** a seeded duplicate is found (non-vacuous). Same pair for `findDuplicateCommandIds` | Pure |
| Unit — `command-registry` | Coverage derived from `APP_LAYOUT_NAV_GROUPS`: every `to` has exactly one command, and `run({ navigate: spy })` calls `spy` with that `to` | Derived cases — an 11th nav item fails the suite |
| Unit — `keyboard-scope.helpers` | Push/pop by id; out-of-order pop removes only its own frame; double pop is a no-op | Pure, store reset per test |
| Integration — dispatcher | Exactly one `keydown` listener bound; `removeEventListener` called with the **same reference** on unmount; survives StrictMode double-invocation (R-5) | `renderHook` + `vi.spyOn(window, 'addEventListener')` |
| Integration — React Aria (R-4, D5) | Render a **real** HeroUI `Table` and `Select`; assert their own key handling survives and no command double-fires | jsdom; React Aria `usePress` responds to `fireEvent.click` per `autoreas-theme` |
| Integration — help dialog | Every `KEYBOARD_COMMANDS` label appears; an injected command appears **without editing the dialog**; an active scope frame's command appears and disappears with the frame | Render with the real constant + an injected extra |
| Integration — scope consumer | `alt+r` fires only while the Notification Center scope is mounted and `canMarkAllRead`; absent from global | Mount/unmount `use-notification-keyboard-scope` |
| Runtime (manual, outside vitest) | WebView2 does not swallow `Alt+<digit>` in the built shell | `wails build` + manual check. jsdom cannot prove this — see §9 |

No `ROUTE_MARKERS` entry is owed: the help dialog is an **overlay, not a route** (R-8). `frontend-render-smoke` is unaffected.

---

## 7. Threat Matrix

**N/A — no routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary.**

Every row of `references/threat-matrix.md` covers git/shell/PR argument composition; this change has none. The only "routing" is client-side `navigate(to)` where `to` comes from a compile-time constant (`APP_LAYOUT_NAV_GROUPS`) and never from user input, a file path or a network payload. Zero Go, REST, WebSocket or SQLite surface.

---

## 8. Migration / Rollout

**No migration required.** Frontend-only, additive, no schema, no wire contract, no new dependency.

Rollback is `proposal.md` §9 unchanged, with one refinement from D11: the kill switch is now **two** lines in `AppLayout.tsx` (the listener and the overlay) rather than one. Removing the listener alone makes every shortcut inert while leaving the overlay mounted but unreachable; removing both is the clean disable. No existing component is modified to depend on the registry — the Notification Center's scope push is additive and every command's `run()` calls a path already reachable by pointer.

---

## 9. Open Questions

- [ ] **Does WebView2 deliver `Alt+<digit>` to the page, or swallow it as a system chord?** Unprovable in jsdom. Mitigation is already structural: chords are **data** in `NAV_COMMAND_CHORDS`, so a swallowed chord is a one-line constant change, not a code change. `sdd-verify` must record the result of a manual check in the built shell rather than inferring it from a green suite.
- [ ] **Should `alt+0` or `alt+shift+1` bind the 10th route?** `alt+0` is shipped (Slack/Chrome convention for "last"). Revisit only if the rail gains an 11th item.

---

## 10. Risks Carried Forward

`proposal.md` §8 R-1 through R-10 stand. Design-level changes to that table:

| Risk | Change |
|---|---|
| R-3 (`key` vs `code`) | **Resolved** by D7. Residual: non-Latin layouts have no letter chords — deferred with the exact one-branch fix recorded |
| R-4 (React Aria coexistence) | Unchanged as a **proof obligation**; D5 adds the mechanism (bubble phase on `window`) that makes the guard non-inert, which is itself now testable |
| R-5 (listener leak under StrictMode) | Mitigated by D10's push-once/pop-by-id plus the same-reference cleanup test |
| **New R-11** | A future modal or command palette will want a frame that **blocks** fall-through to global. D9 deliberately does not add `exclusive` to `KeyboardScopeFrame` — one optional field and one branch when a second overlay actually needs it. Recorded so it is a decision, not an omission |
