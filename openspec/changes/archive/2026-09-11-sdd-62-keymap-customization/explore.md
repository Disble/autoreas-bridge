# Exploration: Keymap Customization (SDD-62)

Change: `2026-09-11-sdd-62-keymap-customization`
Source: orchestrator audit, Engram observation **#9290**, topic
`sdd/2026-09-11-sdd-62-keymap-customization/explore`. This file is a faithful English rendering of
that observation (artifact language is English per CLAUDE.md #13). Nothing is softened and no
finding is re-derived; every `file:line` below is the orchestrator's verified evidence.

---

## 1. Purpose of the audit

The user asked directly whether SDD-61's architecture survives the extension a keymap customization
panel needs. The answer is **PARTIALLY**, and one claim the orchestrator had made twice was false.

## 2. Extends cleanly (verified)

| Existing surface | Why it extends |
|---|---|
| `findDuplicateBindings` / `findDuplicateCommandIds` (`registry.helpers.ts`) | Both operate over *any* `CommandDefinition[]`, so they work unchanged on a command array with overrides already applied |
| `normalizeChord` (`chord.helpers.ts`) | Exactly what a "press a key to assign it" UI needs. It exists and has 100% mutation coverage |
| `formatChord` + `toShortcutSections` | Display formatting already solved |
| `ShortcutsHelpDialog` | Accepts an injectable `commands` prop — designed for this (SDD-61 spec scenario S14) |
| The scope stack | Unaffected |

## 3. Does NOT extend — the missing seams (verified)

1. **`NAV_COMMAND_CHORDS` is module-private.** `command-registry.constants.ts:13`, declared `const`
   with no `export`. The orchestrator itself made it private during Slice 2 to satisfy fallow's
   dead-code rule (an exported value with no importer fails the gate). **The Settings panel cannot
   read it.**

2. **No override layer exists.** `dispatch.helpers.ts:3` imports `KEYBOARD_COMMANDS` and reads it
   directly at line 100 (`resolveCommand(chord, frames, KEYBOARD_COMMANDS)`). The chord is baked
   into every `CommandDefinition` at module load. There is no seam at which to apply a user
   preference. SDD-62 must **insert** that resolution seam and thread it through the dispatcher
   **and** the help dialog.

3. **Correction to a previous orchestrator claim.** "The keymap is a data table separate from the
   commands, precisely so it can be remapped" is true **only for the navigation commands**. For
   scoped commands it is **FALSE** — `use-notification-keyboard-scope.ts:28` carries
   `chord: 'alt+r'` inside a `useMemo` in the feature. `Alt+R` is not remappable without also
   centralizing scope chords.

4. **Persistence requires Go.** The `appSettingsStore` interface (`internal/desktop/app.go:150-159`)
   declares one typed accessor pair per preference (`DownloadsRoot`, `AutoStartEnabled`,
   `EpisodeRenameEnabled`, `APIAddr` and their setters). There is **no generic bound `Get`/`Set`**,
   even though `internal/settings/store.go` exposes public `Get`/`Set`. SDD-62 needs: a Go accessor
   pair, an interface method, a bound `App` method, a frontend infrastructure source, and tests for
   each. **SDD-61 touched ZERO Go files; SDD-62 necessarily crosses into Go.**

## 4. Product decisions already confirmed by the user

- The shortcut map goes **FIRST** in the customization panel. Do **not** add a floating `?` button
  or a per-screen corner hint — the user rejected that orchestrator proposal: it is permanent
  visual noise for a power-user feature.
- The user prefers `Ctrl+` over `Alt+`. Warning given: `Ctrl+<digit>` is **more** risky, not less —
  in Chromium `Ctrl+0` resets zoom, and WebView2 **is** Chromium. The panel turns this into a user
  preference so the default stops being an argument.
- Settings is already a tab registry (`PREFERENCES_ROUTE_TABS` in
  `shared/preferences/preferences-route.constants.ts`), so the new section is one more entry.

## 5. Runtime evidence

The user opened the overlay with `?` in the real packaged app (screenshot). That proves the
dispatcher is live and that this chord traverses WebView2. `Alt+R` was correctly absent because its
scope was not mounted. **Still unverified:** whether `Alt+<digit>` navigates in the packaged app.
This is a *design input*, not a nicety — if WebView2 swallows whole chord families, the UI must warn
"this key may not work" rather than let the user configure something dead.

## 6. User mandate for SDD-62

Update **and document** the architecture as part of the change. That includes correcting ADR-019's
claim about keymap separability, and documenting the new override seam.
