---
name: keyboard-shortcuts
description: "Keyboard shortcuts run through one command registry and one global dispatcher, never per-component key handlers. Use when adding or changing a shortcut, scoping a shortcut to a screen, debugging why a chord does nothing (or fires twice), or touching the shortcuts help dialog. Keywords: keyboard, shortcut, chord, hotkey, Alt+1, dispatcher, command registry, KEYBOARD_COMMANDS, useKeyboardScope, scope stack, defaultPrevented, ShortcutsHelpDialog."
metadata:
  author: autoreas-bridge
  version: "2.0.0"
  scope: project
  updates: living
---

# Keyboard Shortcuts

A shortcut is **data in a registry**, not a key handler in a component. One `keydown` listener exists for the whole app. Adding a shortcut means adding an entry; it never means calling `addEventListener` or writing `onKeyDown`.

A chord you write in the registry is a **default**, not the effective keymap. A user can rebind it from Settings → Shortcuts, and every surface that resolves a chord — the dispatcher, the `?` overlay, the panel itself — must go through `effectiveChord`/`resolveKeymap` (`keymap.helpers.ts`) against their stored overrides, never read a binding's `chord` field directly. Reading `chord` straight off a `CommandDefinition` silently ignores a rebind.

Full rationale and rejected alternatives: `docs/adr/019-keyboard-command-registry.md` (the registry) and `docs/adr/020-keymap-override-seam.md` (the override seam).

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
getKeyboardState() -> { frames, overrides }        (one store read, overrides included since ADR-020)
        ↓
resolveCommand(chord, frames, KEYBOARD_COMMANDS, overrides)
        ↓  scope frames top-down; each command matched by effectiveChord(command, overrides), not its raw chord
command.enabled?.() -> command.run(context)
```

The `?` overlay and the Settings shortcuts panel take the same `overrides` and call `resolveKeymap`
instead — the display shape of the identical rule `effectiveChord` applies. There is exactly one
lookup rule; see `docs/adr/020-keymap-override-seam.md` D2.

| File | Owns |
|---|---|
| `command-registry.constants.ts` | `KEYBOARD_COMMANDS` — the shipped, default registry |
| `dispatch.helpers.ts` | the guards, scope + override resolution, `dispatchKeyboardEvent` |
| `chord.helpers.ts` | `normalizeChord`, `formatChord` |
| `registry.helpers.ts` | `buildNavigationCommands`, `findDuplicateBindings`, `findDuplicateCommandIds`, `findShadowedBindings` |
| `keymap.types.ts` / `keymap.helpers.ts` / `keymap.constants.ts` | `KeymapOverrides`/`KeymapDocument`, `effectiveChord`/`resolveKeymap`/`parseKeymap`/`serializeKeymap`/`pruneKeymap`/`findChordHazard`, `SCOPED_COMMAND_BINDINGS` |
| `keyboard.constants.ts` | `keyboardStore` (vanilla zustand) and the lookup constants |
| `keyboard-scope.helpers.ts` | frame push/pop, `setKeyboardHelpOpen`, `setKeymapOverrides` |
| `use-keymap-overrides.ts` | loads the persisted document once, publishes `overrides`, always resolves `keymapLoadState` |
| `use-keyboard-dispatcher.ts` | the one listener |
| `use-keyboard-scope.ts` | a screen's frame lifecycle |
| `ui/ShortcutsHelpDialog/` | the `?` overlay, derived from the registry, resolved through overrides |
| `ui/KeymapPanel/`, `ui/KeymapBindingRow/` | Settings → Shortcuts: the full map, per-row `Rebind`/`Revert`, reset-to-defaults |

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

## Overrides

A user can rebind almost any shortcut from **Settings → Shortcuts** (`ui/KeymapPanel/`). The map
renders every registry entry, including scoped ones via `SCOPED_COMMAND_BINDINGS` — a scoped chord
written inline in a feature hook, the way pre-ADR-020 code did, is invisible to that panel and to
`resolveCommand`'s conflict/shadow checks. Add scoped metadata to `SCOPED_COMMAND_BINDINGS` (keyed by
the command's own `id`), never inline it in the feature hook.

| Rule | Detail |
|---|---|
| Persistence | One opaque JSON string under `app_settings["keyboard.keymap"]`. Go never parses it — `internal/settings/store.go`'s `Keymap`/`SetKeymap` delegate straight to `Get`/`Set`. `normalizeChord` (this package) is the sole authority on chord grammar |
| Bind-time conflicts | A same-scope collision is **refused** (`findDuplicateBindings`); a cross-scope collision **saves and warns** (`findShadowedBindings`) because `resolveCommand` already gives the innermost scope the win — blocking it would contradict that resolution rule |
| Persist then publish | `use-keymap-panel.ts` calls the store's `overrides` only after `setKeymap` returns `'ok'`. A failed write never touches `overrides`, so the dispatcher is never briefly out of sync with what was actually saved |
| Recovery | `Revert` (per binding) and `Reset to defaults` are pointer-only `Button`s, proven by tests asserting zero keyboard events fired. Reset calls `SetKeymap('')` — Go's own escape hatch — never a document enumerating the defaults |
| Hazards | `findChordHazard` is advisory and display-only, never blocking. Today it has one member, `'browser-zoom'` (Chromium's `ctrl+0`/`ctrl++`/`ctrl+-` family); see the corrected note in `keymap.types.ts` for why the earlier `alt+` hazard family was dropped, not narrowed |

Full decision record, including the six rejected-alternatives tables: `docs/adr/020-keymap-override-seam.md`.

## When NOT to use this

- **Key handling inside one widget.** HeroUI is React Aria: a table's arrow keys, a dropdown's Escape, a dialog's focus trap are already handled. Do not re-implement them, and do not add a shortcut that fights them — a focused widget always wins (see D5 below).
- **OS-global hotkeys** (app unfocused). Wails v2.15 has no `KeyBindings` and no global hotkey API; that would need a third-party Go library or a raw win32 call, entirely outside Wails.
- **Wails menu accelerators.** Deliberately rejected: this is a tray app (`StartHidden`, `HideWindowOnClose`) and a visible menu bar is a real regression. If ever wanted, the menu callback goes through `runtime.EventsEmit` into the *same* registry — another door, not another gate.

## Gotchas that have already cost time

**The listener binds in the BUBBLE phase, never capture.** React 18 attaches at the `#root` container (`main.tsx`), so a `window` bubble listener sees `defaultPrevented` already set by React Aria. In capture phase that guard goes **silently inert** — its unit test still passes, because the guard exists and simply never sees a marked event. `KeyboardDispatcherListener.react-aria.test.tsx` is the proof: it pushes a probe command on the exact chord a real `Table`/`Select` claims and asserts the widget acted, the event was cancelled, and the probe did not run. Do not weaken that test to a mocked event.

**Chord capture (`use-chord-capture.ts`'s armed `Rebind` control) depends on that same bubble-phase binding.** Capture suppresses a keypress by calling `event.preventDefault()` first and unconditionally in its own `onKeyDown`, relying on the global dispatcher observing that flag when the native event bubbles up to `window` afterward. Moving the dispatcher's listener to capture would not just re-break the React Aria guard above — it would silently disable capture suppression too, by the identical mechanism, since capture would then run and resolve *before* the control's own handler ever sets the flag. One phase decision, two guards depending on it.

**`enabled: () => false` swallows the chord; it does not fall through.** The innermost frame declaring a chord owns it. A disabled scoped command means "nothing happens", never "try the global one".

**Frames pop by id, not pop-last.** StrictMode double-invokes effects, so tail-popping removes someone else's frame.

**Never plant an export for a later change.** `fallow audit` fails a commit three separate ways, and a colocated test counts as a consumer for all of them (fallow infers test roots under `src/`):

| Finding | Fires when |
|---|---|
| Unused files | Nothing reaches the file from any entry point |
| Unused exports | An exported **value** — `const`, `function` — has no importer |
| Unused type exports | An exported **type** has no consumer, **including inside a reachable file** |

Values and types both fail; they just fail under different headings. An earlier version of this section claimed types were exempt, which was wrong — it generalised from `keyboard.types.ts`, where every type happened to be referenced by another type in the same file, and **an in-file type-to-type reference counts as a consumer**. Measured 2026-09-11 by adding an unreferenced interface to that already-imported file: `fallow audit` reported "Unused type exports" and exited 1.

So a `.types.ts` written for hooks or components that do not exist yet needs its own colocated shape-pinning test — a fixture builder that constructs a literal satisfying each interface — not just a test for the helpers beside it. This rule is what killed `use-keyboard-store.ts` and `KEYBOARD_SCOPE` in the first slice.

**A plain `const` cannot live in a `.helpers.ts` file.** `dharness/role-file-shape` reserves those for types and functions; Sets, RegExps and object maps go in `.constants.ts`.

**`shared/` cannot import `features/`.** `.dharness/fallow.jsonc` allows `shared -> infrastructure` only. A feature's scope hook lives in the feature and imports `shared/`, which is the allowed direction.

**The nav-command test derives its expectations from `APP_LAYOUT_NAV_GROUPS` on purpose.** That inverts the usual rule against asserting via the production symbol. It is deliberate: adding an eleventh rail route must fail the suite until someone assigns it a chord. Do not "fix" it into hand-listed literals. `NAV_COMMAND_CHORDS` stays hand-listed for the same reason — a new route yields no chord rather than a bogus `alt+11`.

## Known limits

| Limit | Status |
|---|---|
| A layout with no Latin letters gets digits and `?` but no letter chords | Deliberately unshipped; the one-branch fix is written in ADR-019 §4, and no affected user is known |
| Whether WebView2 swallows `Alt+<digit>` as a system chord | **Resolved 2026-09-11.** The repository owner validated `Alt+1` through `Alt+0` and `Alt+R` in the packaged build. No hazard is recorded for `alt+` chords any more (see Overrides above) |
| A verified list of chords Windows itself reserves, beyond the known Chromium zoom family | **Still open.** `docs/adr/020-keymap-override-seam.md` carries it forward rather than guessing at a narrower `alt+`-adjacent hazard with no evidence behind it |
| Keymap remapping and persistence | **Shipped** (SDD-62, ADR-020): Settings → Shortcuts, `SCOPED_COMMAND_BINDINGS`, `app_settings["keyboard.keymap"]` |
| Command palette | Still out of scope. The registry and `CommandContext` shape are what it would build on (ADR-019 Consequences) |

## Checklist before you commit a shortcut

- [ ] The entry is in the registry (or a `useKeyboardScope` hook), not an `onKeyDown`.
- [ ] `label` reads as a sentence a user would recognise in the help dialog.
- [ ] `section` matches an existing group, or adds one deliberately.
- [ ] The chord does not collide — `findDuplicateBindings` asserts this over the shipped array, so a collision is a red test.
- [ ] Nothing new is exported without an importer in the same commit.
- [ ] You ran `bun --cwd="frontend" run test -- keyboard`.
- [ ] Mutation: `bun --cwd="frontend" run test:mutation:staged`, and isolate to your own files — the repo-blended score hides survivors behind an average. Note that `// Stryker disable next-line` does **not** reach a trailing call-expression argument such as a deps array; document an equivalent mutant in prose instead of writing a directive that does nothing.

## Next step

Remapping shipped in SDD-62 — see Overrides above and `docs/adr/020-keymap-override-seam.md`. Adding a
whole new *kind* of shortcut surface (a command palette) is still a design change, not an entry: read
`docs/adr/019-keyboard-command-registry.md`'s Consequences first.
