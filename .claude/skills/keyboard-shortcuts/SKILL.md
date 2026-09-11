---
name: keyboard-shortcuts
description: "Keyboard shortcuts run through one command registry and one global dispatcher, never per-component key handlers. Use when adding or changing a shortcut, scoping a shortcut to a screen, debugging why a chord does nothing (or fires twice), or touching the shortcuts help dialog. Keywords: keyboard, shortcut, chord, hotkey, Alt+1, dispatcher, command registry, KEYBOARD_COMMANDS, useKeyboardScope, scope stack, defaultPrevented, ShortcutsHelpDialog."
metadata:
  author: autoreas-bridge
  version: "1.0.0"
  scope: project
  updates: living
---

# Keyboard Shortcuts

A shortcut is **data in a registry**, not a key handler in a component. One `keydown` listener exists for the whole app. Adding a shortcut means adding an entry; it never means calling `addEventListener` or writing `onKeyDown`.

Full rationale and rejected alternatives: `docs/adr/019-keyboard-command-registry.md`.

## Quick path

**A global shortcut** — add one entry to `KEYBOARD_COMMANDS` in `frontend/src/shared/keyboard/command-registry.constants.ts`:

```ts
{
  id: 'catalog.focusSearch',      // unique; duplicate ids fail a test
  scope: 'global',
  chord: 'alt+f',                 // canonical form, see Chord format
  label: 'Focus catalog search',  // shown verbatim in the help dialog
  section: 'Catalog',             // groups it in the help dialog
  run: (context) => { /* ... */ },
}
```

**A shortcut that only exists on one screen** — write a feature hook that calls `useKeyboardScope`, and call it from that screen's smart hook. Copy `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-keyboard-scope.ts`; it is the reference implementation:

```ts
const commands = useMemo<readonly CommandDefinition[]>(() => [{
  id: 'notification-center.mark-all-read',
  scope: 'notification-center',
  chord: 'alt+r',
  label: 'Mark all as read',
  section: 'Notifications',
  enabled: () => canMarkAllRead,   // false swallows the chord, see below
  run: () => onMarkAllRead(),
}], [canMarkAllRead, onMarkAllRead]);

useKeyboardScope({ scope: 'notification-center', commands });
```

A new scope value goes in the `KeyboardScope` union in `keyboard.types.ts`. There is **no `KEYBOARD_SCOPE` constant** — one was written and removed because nothing imported it, and an exported value with no importer fails the gate (see Gotchas).

## Architecture

```
window keydown (BUBBLE phase, one listener)
        ↓  useKeyboardDispatcher, mounted once via KeyboardDispatcherListener in AppLayout
dispatchKeyboardEvent
        ↓  four guards: defaultPrevented · isComposing · typing target · no chord
normalizeChord(event) -> 'alt+1' | null
        ↓
resolveCommand(chord, frames, KEYBOARD_COMMANDS)
        ↓  scope frames top-down, innermost frame declaring the chord wins
command.enabled?.() -> command.run(context)
```

| File | Owns |
|---|---|
| `command-registry.constants.ts` | `KEYBOARD_COMMANDS` — the shipped registry |
| `dispatch.helpers.ts` | the guards, scope resolution, `dispatchKeyboardEvent` |
| `chord.helpers.ts` | `normalizeChord`, `formatChord` |
| `registry.helpers.ts` | `buildNavigationCommands`, `findDuplicateBindings`, `findDuplicateCommandIds` |
| `keyboard.constants.ts` | `keyboardStore` (vanilla zustand) and the lookup constants |
| `keyboard-scope.helpers.ts` | frame push/pop, `setKeyboardHelpOpen` |
| `use-keyboard-dispatcher.ts` | the one listener |
| `use-keyboard-scope.ts` | a screen's frame lifecycle |
| `ui/ShortcutsHelpDialog/` | the `?` overlay, derived from the registry |

## Chord format

`normalizeChord` produces one canonical string. Write chords in that exact form.

| Input | Chord | Why |
|---|---|---|
| `Alt` + digit-row `1` | `alt+1` | digit row resolves by physical position, so AZERTY's `&` key still gives `alt+1` |
| `Shift` + `/` (US) | `?` | the browser already folded Shift into the character; `Shift+,` on AZERTY gives the same `?` |
| `Alt` + `Shift` + `R` | `alt+shift+r` | letters keep the `shift+` prefix |
| `Alt` + numpad `1` | `alt+numpad1` | never collides with the digit row |
| `Shift` alone | `null` | a modifier with no companion key is not a chord |

Modifier order is fixed: `ctrl+alt+shift+meta+<key>`.

## When NOT to use this

- **Key handling inside one widget.** HeroUI is React Aria: a table's arrow keys, a dropdown's Escape, a dialog's focus trap are already handled. Do not re-implement them, and do not add a shortcut that fights them — a focused widget always wins (see D5 below).
- **OS-global hotkeys** (app unfocused). Wails v2.15 has no `KeyBindings` and no global hotkey API; that would need a third-party Go library or a raw win32 call, entirely outside Wails.
- **Wails menu accelerators.** Deliberately rejected: this is a tray app (`StartHidden`, `HideWindowOnClose`) and a visible menu bar is a real regression. If ever wanted, the menu callback goes through `runtime.EventsEmit` into the *same* registry — another door, not another gate.

## Gotchas that have already cost time

**The listener binds in the BUBBLE phase, never capture.** React 18 attaches at the `#root` container (`main.tsx`), so a `window` bubble listener sees `defaultPrevented` already set by React Aria. In capture phase that guard goes **silently inert** — its unit test still passes, because the guard exists and simply never sees a marked event. `KeyboardDispatcherListener.react-aria.test.tsx` is the proof: it pushes a probe command on the exact chord a real `Table`/`Select` claims and asserts the widget acted, the event was cancelled, and the probe did not run. Do not weaken that test to a mocked event.

**`enabled: () => false` swallows the chord; it does not fall through.** The innermost frame declaring a chord owns it. A disabled scoped command means "nothing happens", never "try the global one".

**Frames pop by id, not pop-last.** StrictMode double-invokes effects, so tail-popping removes someone else's frame.

**Never plant an export for a later change.** `fallow audit` fails a commit on an exported value nothing imports, and on a file nothing reaches. A colocated test counts as a consumer (fallow infers test roots under `src/`); exported *types* are exempt. This is what killed `use-keyboard-store.ts` and `KEYBOARD_SCOPE` in the first slice.

**A plain `const` cannot live in a `.helpers.ts` file.** `dharness/role-file-shape` reserves those for types and functions; Sets, RegExps and object maps go in `.constants.ts`.

**`shared/` cannot import `features/`.** `.dharness/fallow.jsonc` allows `shared -> infrastructure` only. A feature's scope hook lives in the feature and imports `shared/`, which is the allowed direction.

**The nav-command test derives its expectations from `APP_LAYOUT_NAV_GROUPS` on purpose.** That inverts the usual rule against asserting via the production symbol. It is deliberate: adding an eleventh rail route must fail the suite until someone assigns it a chord. Do not "fix" it into hand-listed literals. `NAV_COMMAND_CHORDS` stays hand-listed for the same reason — a new route yields no chord rather than a bogus `alt+11`.

## Known limits

| Limit | Status |
|---|---|
| A layout with no Latin letters gets digits and `?` but no letter chords | Deliberately unshipped; the one-branch fix is written in ADR-019 §4, and no affected user is known |
| Whether WebView2 swallows `Alt+<digit>` as a system chord | **Unverified.** jsdom cannot prove it. Needs a human on `wails build` + the packaged app. If a chord is swallowed, the fix is a one-line `NAV_COMMAND_CHORDS` data change |
| Command palette, keymap remapping and persistence | Out of scope for SDD-61; the registry and the `app_settings` KV in `internal/settings/store.go` are what a follow-up would build on |

## Checklist before you commit a shortcut

- [ ] The entry is in the registry (or a `useKeyboardScope` hook), not an `onKeyDown`.
- [ ] `label` reads as a sentence a user would recognise in the help dialog.
- [ ] `section` matches an existing group, or adds one deliberately.
- [ ] The chord does not collide — `findDuplicateBindings` asserts this over the shipped array, so a collision is a red test.
- [ ] Nothing new is exported without an importer in the same commit.
- [ ] You ran `bun --cwd="frontend" run test -- keyboard`.
- [ ] Mutation: `bun --cwd="frontend" run test:mutation:staged`, and isolate to your own files — the repo-blended score hides survivors behind an average. Note that `// Stryker disable next-line` does **not** reach a trailing call-expression argument such as a deps array; document an equivalent mutant in prose instead of writing a directive that does nothing.

## Next step

Adding a whole new *kind* of shortcut surface (a palette, a remapping UI) is a design change, not an entry: read `docs/adr/019-keyboard-command-registry.md` first, and the deferred scope in `openspec/changes/2026-09-10-sdd-61-keyboard-shortcuts/proposal.md`.
