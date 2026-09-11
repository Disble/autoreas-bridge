# ADR-020: Keymap overrides resolve at read time through one required parameter

- **Status**: Accepted, implemented
- **Date**: 2026-09-11
- **Supersedes**: nothing
- **Amends**: `docs/adr/019-keyboard-command-registry.md` (factual correction, see that ADR's own
  amendment note)
- **Related**: `openspec/changes/2026-09-11-sdd-62-keymap-customization/design.md` (D1, D2, D5, D7,
  D8, D9, D11 — this ADR condenses those after implementation), `openspec/specs/keymap-customization/spec.md`,
  ADR-019 (the registry this change adds a resolution rule on top of)

## Context

ADR-019 shipped a registry where every chord is a fixed field on a `CommandDefinition`. That is
correct as a default, but it is not remapping: a user who wants `Ctrl+1` instead of `Alt+1` has no
way to say so without editing source. SDD-62 adds exactly one new concept — a persisted, opaque
document of `{ commandId: chord }` overrides — and the six decisions below are about keeping that
concept from leaking into every place ADR-019 already established as settled: the dispatcher's hot
path, the one keydown listener's bubble-phase binding, the registry's duplicate/shadow detection,
and Go's role as a storage layer that never interprets what it stores.

## Decision

### 1. The seam is a read added to a store fetch the dispatcher already makes, not new plumbing

**Choice**: `KeyboardStoreState` gains `overrides: KeymapOverrides` and `keymapLoadState:
'pending' | 'loaded' | 'failed'`. `dispatch.helpers.ts:107` destructures `overrides` from the exact
`getKeyboardState()` call it already made on every keystroke to read `frames`. No new parameter
reaches `dispatchKeyboardEvent`, `use-keyboard-dispatcher.ts`, or `KeyboardDispatcherListener`.

| Rejected | Why |
|---|---|
| Thread `overrides` down from the listener into `dispatchKeyboardEvent` | Changes a signature every dispatcher suite pins, to carry a value the store read at the same call site already produces |
| Mutate `KEYBOARD_COMMANDS` in place when an override is loaded | Destroys the shipped defaults a reset needs to restore, and makes the registry untestable independent of whatever was last written |
| A precomputed `effectiveCommands` array kept in the store | Not merely wasteful — impossible for the half that matters. `KeyboardScopeFrame.getCommands` is a lazy thunk read at dispatch time (ADR-019 §2), so nothing computed at override-change time can cover a frame's commands; they do not exist until their scope mounts |

### 2. `effectiveChord` is the one lookup rule; `resolveKeymap` is defined in terms of it, never a copy

**Choice**:

```ts
function effectiveChord(binding: CommandBinding, overrides: KeymapOverrides): Chord {
  return overrides[binding.id] ?? binding.chord;
}
```

`resolveCommand` (`dispatch.helpers.ts`) gained exactly one new parameter, `overrides`, and it is
**required**, not optional-with-a-`{}`-default. An optional parameter lets a future call site
compile while silently skipping every override — the exact regression this ADR exists to prevent.
Making it required turns that regression into a compile error at every call site instead of a
runtime one discovered later.

`resolveKeymap` (used by the `?` overlay and the Settings panel) calls `effectiveChord` per binding
rather than re-deriving the lookup, so there is exactly one place that decides what an override
means; the dispatcher's hot path and the two display paths cannot disagree about a chord because
they share the same function, not merely the same intent.

### 3. Go persists an opaque string and owns no chord grammar

**Choice**: `internal/settings/store.go`'s `Keymap`/`SetKeymap` pair delegates to the store's
existing untyped `Get`/`Set`, with no `TrimSpace` and no parsing — unlike `SetAPIAddr`, which does
trim, because a keymap document is content Go must not interpret at all, not merely content that
happens not to need trimming today.

`TestKeymapRoundTripsOpaqueBytesUnchanged` (`internal/settings/keymap_test.go`) persists
`` `{not json: alt++` `` — deliberately neither valid JSON nor a valid chord — and asserts it comes
back byte-identical. That test, not a comment, is what stops a future Go-side chord validator: the
`Keymap`/`SetKeymap` accessor pair is two lines of delegation each, with no branch a mutation run
could find anything to kill in, which is the measured evidence that there is nothing left in either
method to interpret.

| Rejected | Why |
|---|---|
| A Go validator or chord parser | A second grammar that drifts from `normalizeChord` (TypeScript) the first time a chord rule changes, while the TypeScript one already carries full mutation coverage |
| One `app_settings` row per binding | The store's `Get`/`Set` operate on one exact key; per-row needs a prefix scan and a delete path — three new SQL shapes for a document that is always read and written whole |

### 4. Duplicates block, cross-scope shadowing warns — two checks because resolution has one winner

**Choice**: at bind time, build the candidate keymap and consult two helpers in a fixed order:
`findDuplicateBindings` first (same-scope collision — refuse, name the colliding label, do not
write), then `findShadowedBindings` (cross-scope collision — save, then warn).

These are two checks, not one blurred check, because `resolveCommand` already gives the innermost
scope frame the win over a same-chord global command (ADR-019 §1). Blocking a cross-scope collision
would contradict that resolution rule by refusing a keymap the dispatcher would have resolved
correctly anyway. `findShadowedBindings` groups by chord alone and reports only groups spanning more
than one scope, so a same-scope collision — already blocked before this function runs — can never
also appear here; the two can never disagree over the same candidate.

The candidate check (`use-keymap-panel.ts`'s `findCollidingBinding`) is a direct scan over the exact
`` `${scope}::${chord}` `` key `findDuplicateBindings` groups by, not a call into that helper. Calling
it would mean building a second full array just to discard every result but one; a direct scan over
the single candidate change a rebind ever makes is cheaper and reads as what it is. The
`{scope, chord}` key is therefore written in two places (`registry.helpers.ts` and
`use-keymap-panel.ts`) rather than one, an accepted duplication over a second helper call whose
result is thrown away except for one entry.

### 5. Capture suppresses by calling `preventDefault()` first and unconditionally

**Choice**: the armed `Rebind` control's own `onKeyDown` calls `event.preventDefault()` before doing
anything else — before checking IME composition, before checking `Escape`, before normalizing. That
is the entire suppression mechanism; there is no dispatcher change and no scope frame involved.

This works **only** because the global dispatcher listens on `window` in the bubble phase (ADR-019
§3), not capture: React delegates at `#root`, the capture control's handler runs there and marks the
event `defaultPrevented` before the native bubble path ever reaches `window`, where the dispatcher's
first guard bails on exactly that flag. Moving the dispatcher's listener to the capture phase — a
change ADR-019 already flags as breaking its own `defaultPrevented` guard — would silently disable
capture suppression too, by the same mechanism, for the same reason. The two guards share one
assumption about listener phase; this ADR does not introduce a second one, it depends on the one
ADR-019 already documented and tested.

| Rejected | Why |
|---|---|
| `stopPropagation()` alongside `preventDefault()` | Its interaction with React's root delegation and a `window` listener is not proven anywhere in this repo, while `preventDefault()` already has a passing cross-cutting test (`KeyboardDispatcherListener.react-aria.test.tsx`'s technique, reused for capture). Adding an unproven second mechanism widens the failure surface instead of narrowing it |
| A `keymap-capture` scope frame | A frame only shadows chords it declares; capture must suppress an arbitrary keystroke, including one bound to nothing |

### 6. Recovery is pointer-only, by requirement, and reset clears the setting rather than writing defaults

**Choice**: both `Revert` (per binding) and `Reset to defaults` are `Button`s reachable and operable
with a pointer alone, proven by tests that grep for zero `fireEvent.keyDown`/`userEvent.keyboard`
calls. `Reset to defaults` calls `setKeymap('')` — clearing the stored row, Go's own escape hatch —
rather than writing a document that enumerates every shipped chord.

A keyboard-only escape from a keymap the user just broke with the keyboard is not an escape; pointer
input is the only channel guaranteed not to depend on the thing being repaired. Writing an explicit
"defaults" document was rejected because it would go stale the first time a shipped chord changed —
clearing the row instead means the shipped registry, wherever it currently stands, is always what an
empty document resolves to.

### 7. The load signal is a three-state union, not a boolean

**Choice**: `KeyboardStoreState.keymapLoadState: 'pending' | 'loaded' | 'failed'`, not the boolean
`isKeymapLoaded` `design.md` §2 D11 originally specified.

A failed read (a rejected promise, an unattached Wails binding) and a user who has simply never
rebound anything both leave `overrides` at `{}`. A boolean flag collapses those two into the same
`true`, and the spec requires the panel to tell them apart: a broken runtime gets the error `Alert`,
an empty-but-working keymap gets the ordinary map with nothing marked overridden. `'loaded'` means
the read resolved and was interpreted (successfully or via `parseKeymap`'s degrade-to-`{}` path for
garbage); `'failed'` means the read itself rejected. Only `'failed'` earns the error state; a
malformed-but-present document is `'loaded'` with no overrides, which is the documented degrade
behaviour for a corrupted document (D4 of `design.md`), not a load failure.

This is recorded as a deviation from `design.md`, not silently reconciled: the design's own D11
prose still describes a boolean, and that description is now stale in the same way ADR-019's was —
see this ADR's own amendment to ADR-019 for the parallel case. `design.md` is an immutable change
artifact and is not rewritten for it.

## A staleness this ADR does not repeat

`design.md` §2 D9's hazard table and `tasks.md` task 11.2.4 both describe a two-member
`ChordHazard` union — `'browser-zoom'` and `'unverified-delivery'`, the latter covering every `alt+`
chord on the evidence that none had been confirmed reaching the packaged app. That evidence expired
during this change: the repository owner validated `Alt+1` through `Alt+0` and `Alt+R` in the
packaged build on 2026-09-11, before the panel's hazard legend ever shipped. `ChordHazard` has been
the single member `'browser-zoom'` since the slice that introduced it; no `'unverified-delivery'`
text was ever shipped in the running app. `design.md` and `tasks.md` are immutable change artifacts
and are not corrected for this; it is recorded here, in the durable record, so a reader of the
archived change is not misled by their still-current copies.

## Consequences

- `resolveCommand`'s fourth parameter is required. Any new call site that needs to resolve a chord
  must supply `overrides` explicitly — there is no default that would let it forget.
- `KEYBOARD_COMMANDS` (and `SCOPED_COMMAND_BINDINGS`) remain the **default** keymap, exactly as
  ADR-019's amendment states; the effective keymap is `resolveKeymap`/`effectiveChord` applied over
  them, never a mutated copy of either constant.
- A keymap tuned to one keyboard does not travel with a backup bundle: `app_settings` is
  machine-local by `internal/desktop/app_backup.go`'s existing exclusion, unchanged by this ADR.
- No verified list exists of chords Windows itself reserves outside the known Chromium zoom family.
  That absence is why `'unverified-delivery'` was dropped rather than narrowed to a smaller,
  equally-unverified list — narrowing it would assert exactly what the evidence-backed zoom family
  refuses to assert. Reintroducing any `alt+`-adjacent warning needs that list verified first.

## Alternatives considered

Recorded once here rather than repeated per decision above where a decision already carries its own
rejected table: no repository-wide keymap format change was considered, because `version: 1` in
`KeymapDocument` exists precisely so a future format change migrates an old document instead of
requiring one now.
