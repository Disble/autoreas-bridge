# ADR-019: Keyboard shortcuts run through one command registry, not per-component key handlers

- **Status**: Accepted, implemented
- **Amended**: 2026-09-11 by ADR-020 (keymap override seam)
- **Date**: 2026-09-11
- **Supersedes**: nothing
- **Related**: `openspec/changes/2026-09-10-sdd-61-keyboard-shortcuts/design.md` (D1, D4, D5, D7 —
  this ADR condenses those four decisions after implementation), `openspec/specs/keyboard-shortcuts/spec.md`,
  ADR-006 (frontend runtime read models — the `createStore()` precedent D4 reuses), ADR-011 (no barrel
  files — the concrete-path import rule `KeyboardDispatcherListener`/`ShortcutsHelpDialog` both follow)

## Context

Bridge had no keyboard shortcuts at all before this change: every navigation and every action required
a pointer. The obvious per-component approach — a `useEffect` with its own `addEventListener('keydown',
...)` wherever a shortcut is wanted — does not survive three requirements the proposal set out together:
a duplicate binding must be *detectable*, a help dialog must be *derivable* without a second maintained
list, and a route-scoped command (Notification Center's "mark all as read") must *shadow* a global one
sharing the same chord rather than firing both or neither. None of those three is a property of any
single `useEffect`; they are properties of the *set* of bindings, which per-component handlers never
assemble into one place a test or a UI can read.

## Decision

### 1. The registry is data, not closures

A `CommandDefinition` declares `{ id, scope, chord, label, section, enabled?, run }` as a plain object.
Everything environmental a command's `run` needs — today, only `navigate` — arrives through a
`CommandContext` parameter **at dispatch time**, never captured in a closure at registration time. That
single choice is what makes the three requirements above mechanical rather than aspirational:

| Requirement | Why data-not-closures delivers it |
|---|---|
| No two entries share `{scope, chord}` | `findDuplicateBindings(KEYBOARD_COMMANDS)` is a pure call over a plain array — no render, no mount, no effect timing to race |
| The help dialog renders from the registry | The dialog reads the exact same array the dispatcher resolves against; there is nothing else it *could* read, so the two cannot drift |
| A scoped command shadows a same-chord global one | `resolveCommand` walks scope-stack frames top-down and returns the first frame that *declares* the chord, even when that command's `enabled()` will say no — it never falls through to a same-chord global entry |
| A command's chord is centrally declared, separable metadata — not hardcoded where the command runs | **Corrected 2026-09-11 (was aspirational).** True for the ten navigation commands from the start: their chords live in `NAV_COMMAND_CHORDS`, a data table joined into `CommandDefinition` at registry-build time, never inline in a feature. It was **not** true for the one scoped command: the Notification Center's "mark all as read" declared `chord: 'alt+r'` inline in `use-notification-keyboard-scope.ts`, not in any table this ADR's registry could read independently. SDD-62 (ADR-020) centralized it into `SCOPED_COMMAND_BINDINGS`, which is what makes the claim in this row true for every shipped command, not only the navigation ones |

**Alternatives rejected**: a Chain of Responsibility over per-widget handlers, where an earlier handler
silently wins a duplicate binding with no way to assert it at test time; and direct `key -> callback`
binding, which forfeits remapping, the help dialog, and conflict detection all at once. Both were
rejected in `proposal.md` §4.1 and not reopened here.

### 2. The scope stack is vanilla zustand, not React Context

The active scope stack lives in `keyboardStore`, a `createStore()` instance from `zustand/vanilla`
(`keyboard.constants.ts`), read via `.getState()` outside React and via `useKeyboardStore` (a thin
`useStore(keyboardStore, selector)` wrapper) inside it. The reason is mechanical, not stylistic: the one
global `keydown` listener (`use-keyboard-dispatcher.ts`) is a plain `window.addEventListener` callback
running **outside React's render cycle**, and it must read the current frame stack synchronously on
every keystroke. React Context has no read-outside-a-Provider escape hatch, and a bare module-level
mutable array would give the help dialog nothing to subscribe to when a scope frame's commands change.

The shape is not new to this change: `shared/store/notification-store/notification-store.constants.ts`
already holds a `createStore()` instance for exactly this reason, paired with its own thin
`useNotificationStore` wrapper. `use-keyboard-store.ts` mirrors that pairing verbatim, down to the
default-selector signature, so a reader who already knows one store knows both. `dharness/role-file-shape`
reserves `.helpers.ts` files for types and functions, which is why the store instance itself — a value,
not a function — lives in `keyboard.constants.ts` rather than beside the helpers that read it.

**Alternative rejected**: React Context. Fails the "read outside React" requirement outright — there is
no `useContext` call sites for a `window` listener to make.

### 3. `event.defaultPrevented` is the React Aria coexistence contract

The dispatcher binds on `window` in the **bubble** phase, never capture, and bails immediately when
`event.defaultPrevented` is already `true`. This is the first of the dispatcher's four guards, and it is
what lets a focused HeroUI `Table` keep its own `ArrowDown` row navigation, or an open `Select` keep its
own `Escape` handling, without the global registry double-firing or stealing the key.

The mechanism is a property of where React attaches its own listeners: React 18+ delegates events at the
root container (`#root`), where React itself dispatches synthetic events and React Aria widgets call
`preventDefault()` on the keys they own — **before** the native event reaches `window` in the bubble
path. A bubble-phase `window` listener therefore always observes the flag already set by the time it
runs. A capture-phase listener would run *first* in the native capture path and the guard would be
inert — it would never see `defaultPrevented` become `true`, because that happens later, at `#root`. When
nothing is focused, the event's target is `document.body`, which sits outside `#root`, so no React
synthetic handler runs at all and a global chord fires normally.

**Consequence, stated deliberately, not discovered later**: a focused widget always wins over a global
shortcut. If a table claims `?` for its own typeahead, the shortcuts overlay does not open while that
table has focus. That is the intended priority order.

**Proof obligation, not an assumption**: `KeyboardDispatcherListener.react-aria.test.tsx` mounts a real
HeroUI `Table` and a real open `Select`, fires a real `keydown` each widget owns, and asserts three
things together — the widget's own behavior still fires, the *native* `dispatchEvent` return value is
`false` (proving something upstream called `preventDefault()` before the `window` listener observed the
event), and no command bound to that chord ever runs. A companion positive case fires a real, unclaimed
`Alt+1` and asserts real navigation happens, so the two negative cases are not trivially satisfied by a
dispatcher that does nothing at all.

**Alternative rejected**: binding in the capture phase. Would run ahead of React's own dispatch and could
never observe `defaultPrevented`, defeating the guard's entire purpose.

### 4. `event.key` first, with a positional escape hatch for the digit row

`normalizeChord` resolves the un-prefixed key token in a fixed order: the digit row by **physical
position** (`event.code` matching `Digit0`–`Digit9`) first, then a modifier key pressed alone (which
yields no chord), then the numeric keypad by its own physical position, then `event.key` itself —
lowercased, whether it names a multi-character key (`Escape`, `ArrowDown`) or a single printable
character.

`event.key` wins for everything except the digit row because `event.key` **is** the character a layout
actually produces: `?` normalizes identically whether it arrives as `Shift+/` on a US layout, `Shift+ß`
on German, or `Shift+,` on AZERTY — one binding, no per-layout table. `event.code` would have pinned `?`
to one physical key position and mistranslated it on every other layout. Digits are the sole exception
because a digit chord means "the *n*-th route", a positional concept, so `Digit1` is the honest identity
regardless of what character that key happens to print.

Shift is folded into the chord string (`shift+`) only when the resulting token still needs it: a digit
token always keeps it (`Digit1` alone doesn't imply Shift), and an alphabetic character keeps it, but a
single non-alphabetic printable character does not — `Shift+/` already produced `?` in `event.key`, so
adding `shift+` on top would double-count the modifier and split one physical chord into two different
normalized strings across layouts.

**What this costs, stated plainly rather than hidden**: on AZERTY, `Alt+1` fires from the unshifted `&`
key, so the chord *works* but the help dialog's `Alt + 1` label doesn't match the printed keycap — firing
correctly beats matching the keycap. On Dvorak/Colemak, letter chords follow the character, not the
physical position, which is correct for a character shortcut but differs from QWERTY muscle memory. A
numeric-keypad digit does not trigger a digit-row chord at all — `Numpad1` normalizes distinctly from
`Digit1` by design. Non-Latin layouts (Cyrillic, Greek) produce no letter chords at all, since `event.key`
is non-Latin there; this is a real, currently-unaddressed gap, deferred rather than hidden, because there
is no evidence yet of a user on such a layout and the fix (one added branch mapping `event.key` outside
ASCII back to `event.code`) stays localized entirely inside `normalizeChord` — no dispatcher, registry,
store, or UI change would be needed to add it later.

**Alternatives rejected**: `event.key` everywhere (breaks the digit row's positional intent — a layout
that shifts the digit row would silently misassign which key each chord binds to) and `event.code`
everywhere (breaks every letter and punctuation chord across non-US layouts, the opposite failure).

## Consequences

- Every shortcut in the app — global navigation, the help overlay, and the Notification Center's
  route-scoped "mark all as read" — is one entry in `KEYBOARD_COMMANDS` or a pushed scope frame, never a
  bespoke `useEffect`. Adding a shortcut later means adding a `CommandDefinition`, not wiring a new
  listener.
- The help dialog (`ShortcutsHelpDialog`) needed zero code changes to support an arbitrary future
  command: it groups and renders whatever `[...commands, ...activeFrameCommands]` currently contains.
- A future command palette or Wails menu accelerator (deliberately not shipped in this change — see
  design.md D3) can reach the same registry through the same dispatch-time `CommandContext` shape; no
  registry redesign would be needed to add a second entry point.
- Non-Latin keyboard layouts have no letter chords today. Recorded as a known gap with a scoped, one-file
  fix already identified, not shipped speculatively against zero evidence of the affected population.
- `KeyboardScopeFrame.exclusive` does not exist. A future modal or command palette that needs to *block*
  fall-through to global commands (rather than merely shadow a matching chord) will need one new optional
  field and one new branch in `resolveCommand` — deliberately not added ahead of a second real consumer.
- Since ADR-020, `KEYBOARD_COMMANDS` (and `SCOPED_COMMAND_BINDINGS`) are the **default** keymap, not
  the effective one. Three call sites resolve a binding's *effective* chord through a user's stored
  override rather than reading `chord` directly: the dispatcher (`dispatch.helpers.ts`'s
  `resolveCommand`), the `?` help dialog (`use-shortcuts-help-dialog.ts`), and the Settings shortcuts
  panel (`use-keymap-panel.ts`). A fourth call site that reads `chord` directly instead of resolving
  through `effectiveChord`/`resolveKeymap` would silently ignore a user's rebind.

## Alternatives considered

**Chain of Responsibility over per-widget handlers.** Rejected: a duplicate binding is undetectable —
the earlier handler in the chain silently wins, with nothing to assert against in a test. A flat array
makes the same case a one-line pure-function check.

**Direct `key -> callback` binding wired ad hoc per feature.** Rejected: forfeits remapping, the help
dialog, and conflict detection simultaneously, and scatters the one thing this change needed centralized
— the full set of bindings — across every feature that wants a shortcut. This ADR made remapping
*possible* by keeping every chord as data rather than a closure; SDD-62 (ADR-020) is what actually
shipped it, as a resolution rule applied at read time over that same data.

**React Context for the scope stack.** Rejected: the dispatcher must read the current stack from a plain
`window` listener outside any component's render, where `useContext` cannot reach.

**`event.code` everywhere for chord normalization.** Rejected: ties every letter and punctuation chord to
one physical key position, breaking non-US layouts across the board — the opposite of what the digit-row
exception exists to fix for a genuinely positional case.
