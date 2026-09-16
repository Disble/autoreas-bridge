# Design: Keymap Customization (SDD-62)

Change: `2026-09-11-sdd-62-keymap-customization`
Inputs: `proposal.md`, `explore.md` (this folder), SDD-61's shipped code under
`frontend/src/shared/keyboard/` (**re-read from disk during this phase**), SDD-61's spec at
`openspec/changes/2026-09-10-sdd-61-keyboard-shortcuts/specs/keyboard-shortcuts/spec.md`,
`docs/adr/019-keyboard-command-registry.md`.

> **Size-budget note.** This exceeds the generic 800-word design default. `openspec/config.yaml`
> `rules.design` requires sequence diagrams for complex flows and every architecture decision
> documented with rationale; the phase brief enumerated fifteen questions that must be answered
> concretely; and CLAUDE.md #2 requires recording drift against earlier artifacts explicitly. Content
> is carried in tables and two diagrams rather than prose.

---

## 1. Technical Approach

The keymap becomes a **resolution rule applied at read time**, never a mutation of the shipped
registry. `KEYBOARD_COMMANDS` stops being the effective keymap and becomes the **default** keymap;
one pure function decides a binding's effective chord, and the three surfaces that care — the
dispatcher, the `?` overlay, and the new Settings panel — all call it over the same store field.

```
app_settings["keyboard.keymap"]   (opaque JSON string, Go never parses it)
        │  GetKeymap / SetKeymap  (Wails binding -> PreferencesSource)
        ▼
parseKeymap(raw) -> KeymapDocument | null    (frontend owns the whole grammar)
        │  setKeymapOverrides(document.bindings)
        ▼
keyboardStore: { frames, isHelpOpen, overrides, isKeymapLoaded }
        │
        ├─ dispatch.helpers.ts        effectiveChord(command, overrides)   [hot path]
        ├─ use-shortcuts-help-dialog  resolveKeymap(bindings, overrides)   [display]
        └─ use-keymap-panel           resolveKeymap(bindings, overrides)   [display + editing]
```

Nothing else changes. The scope stack, the four dispatcher guards, `normalizeChord`, `formatChord`
and `findDuplicateBindings` are untouched in behaviour.

### 1.1 Two corrections to earlier artifacts (CLAUDE.md #2 — the code wins)

| Claim | Correction |
|---|---|
| The orchestrator's audit (explore §3.2) says the seam "must be threaded through the dispatcher and the help dialog" | **Partly wrong.** `dispatch.helpers.ts:99` already does `const { frames } = getKeyboardState();` on every keystroke. Adding `overrides` to `KeyboardStoreState` means the dispatcher reads it from a call it **already makes**: no new parameter on `dispatchKeyboardEvent`, no change to `use-keyboard-dispatcher.ts`, no new plumbing in `KeyboardDispatcherListener`. The only signature that changes is `resolveCommand`'s (D2) |
| Proposal D1's pseudo-code: `resolveCommand(chord, resolveKeymap(frames…), resolveKeymap(KEYBOARD_COMMANDS, overrides))` | **Replaced.** That allocates two fresh arrays on every keystroke and needs a second call shape for lazily-read frame commands. D2 passes `overrides` into `resolveCommand` and compares through `effectiveChord` instead — zero allocation, one lookup rule |

---

## 2. Architecture Decisions

### D1 — `overrides` is a store field, because the dispatcher already reads the store

**Choice**: `KeyboardStoreState` gains `overrides: KeymapOverrides` and `isKeymapLoaded: boolean`.
`keyboard-scope.helpers.ts` gains `setKeymapOverrides`; `resetKeyboardStore` clears both new fields.

| Rejected | Why |
|---|---|
| Thread `overrides` down from the listener into `dispatchKeyboardEvent` | Changes a signature four suites pin and buys nothing — the store read at line 99 already happens on every keystroke |
| Mutate `KEYBOARD_COMMANDS` at load | Makes the shipped defaults unrecoverable and the registry untestable; reset-to-defaults (D8) would have nothing to reset to |
| A precomputed `effectiveCommands` array in the store | Mechanically impossible for the half that matters: `KeyboardScopeFrame.getCommands` is read **lazily at dispatch time** (ADR-019 §2, `keyboard.types.ts:41`), so no array written at override-change time could ever cover frame commands |

### D2 — `effectiveChord` for resolution, `resolveKeymap` for display

**Choice**: one lookup rule, two shapes.

```ts
/** The chord a binding actually answers to: the user's override if any, else its declared chord. */
export function effectiveChord(binding: CommandBinding, overrides: KeymapOverrides): Chord {
  return overrides[binding.id] ?? binding.chord;
}

/** The same rule, materialized as rewritten bindings for display and conflict checking. */
export function resolveKeymap<T extends CommandBinding>(
  bindings: readonly T[],
  overrides: KeymapOverrides,
): readonly T[] {
  return bindings.map((binding) => {
    const chord = effectiveChord(binding, overrides);
    return chord === binding.chord ? binding : { ...binding, chord };
  });
}
```

`resolveCommand` gains one **required** fourth parameter and compares through `effectiveChord` in
both its frame loop and its global fallback. Required, not optional-with-`{}`-default: an optional
parameter lets a future call site silently skip overrides, which is the exact bug this change exists
to prevent. A required parameter makes every call site a compile error until it is updated — the
deterministic guard, not a convention.

**Why two functions is not drift**: `resolveKeymap` is *implemented in terms of* `effectiveChord`,
so there is exactly one place that decides what an override means. The hot path allocates nothing;
the display path gets whole objects because `toShortcutSections` and `findDuplicateBindings` both
take binding arrays.

### D3 — `CommandBinding` is the metadata half; scoped bindings are keyed by id

**Choice**: split the type, and centralize the one scoped command's metadata.

```ts
/** A binding's identity and metadata — everything the keymap, the map UI and the conflict checker need. */
export interface CommandBinding {
  readonly id: string;
  readonly scope: KeyboardScope;
  readonly chord: Chord;
  readonly label: string;
  readonly section: CommandSection;
}

/** A binding plus what it does. `enabled`/`run` close over feature state, so they never leave the feature. */
export interface CommandDefinition extends CommandBinding {
  readonly enabled?: () => boolean;
  readonly run: (context: CommandContext) => void;
}
```

`findDuplicateBindings`/`findDuplicateCommandIds` **widen** their parameter to
`readonly CommandBinding[]`. Widening is source-compatible: every existing call passes
`CommandDefinition[]`, which is assignable, so all four existing suites keep passing unchanged.

Scoped metadata moves to a **record keyed by id**, not an array:

```ts
export const SCOPED_COMMAND_BINDINGS = {
  'notification-center.mark-all-read': {
    id: 'notification-center.mark-all-read',
    scope: 'notification-center',
    chord: 'alt+r',
    label: 'Mark all as read',
    section: 'Notifications',
  },
} as const satisfies Readonly<Record<string, CommandBinding>>;
```

| Rejected | Why |
|---|---|
| `readonly CommandBinding[]` + `.find(entry => entry.id === '…')` in the feature hook | `.find` returns `T \| undefined`, forcing a defensive branch nothing can reach and turning a renamed id into a silent runtime `undefined`. That is R-6 (silent `Alt+R` regression) written into the source |
| Keep `chord: 'alt+r'` inline in `use-notification-keyboard-scope.ts` | Resolution would still work (overrides apply by id), but Settings could not **enumerate** the binding — a scope frame exists only while its panel is mounted. A map that omits `Alt+R` is a discoverability surface that lies (proposal D2) |

A keyed record makes `SCOPED_COMMAND_BINDINGS['notification-center.mark-all-read']` a compile-time
checked property access: no `undefined`, no defensive branch, and a renamed id is a TypeScript error.

### D4 — One versioned document; absence is the default; orphans are ignored, not pruned on read

```ts
/** User-owned chord per command id. An id absent here keeps its declared chord. */
export type KeymapOverrides = Readonly<Record<string, Chord>>;

/** The persisted document. `version` exists so a future chord-format change migrates instead of guessing. */
export interface KeymapDocument {
  readonly version: 1;
  readonly bindings: KeymapOverrides;
}
```

| Case | Behaviour | Rationale |
|---|---|---|
| Command has **no** override | Keeps its declared chord | `resolveKeymap` iterates **bindings** and looks up by id, so absence needs no code. Materializing defaults into the document would freeze them, the same reason `store.go:111-115` gives for not writing `APIAddr`'s default on first read |
| Override for an id that **no longer exists** | Ignored at resolution; **not** deleted on read | Iterating bindings means a dead id has nothing to attach to — it can never resurrect a removed command. Deleting on read would silently destroy the binding of a command renamed and then reverted |
| Orphans and no-op overrides | Pruned **only when the user next saves** (`pruneKeymap`) | A read is not a write. A no-op override (chord equals the declared default) is storage noise, dropped at the same point |
| `parseKeymap` fails: garbage, `null`, not an object, wrong `version`, `bindings` not an object, a non-string chord value | Degrades to `{}` — shipped defaults | Never a crash, never a **partially** applied keymap. A per-entry salvage would leave the user with a keymap that is neither theirs nor the default |
| Document is `""` or the row is missing | Identical: no overrides | `settings.Get` already returns `""` for a missing row (`store.go:48-50`). The two being indistinguishable is correct, not a defect: both mean "shipped defaults" |

### D5 — Go persists an opaque string, and a test is what stops it growing a grammar

**Choice**: `keyKeymap = "keyboard.keymap"` plus `Keymap`/`SetKeymap` on `settings.SQLiteStore`, two
methods on the `appSettingsStore` port, two bound `App` methods. Signatures are `string` in, `string`
out. No `TrimSpace` (unlike `SetAPIAddr`) — trimming is a content transformation on a document Go
must not interpret.

Three mechanical reasons Go cannot grow a chord parser, in increasing order of strength:

1. There is no Go type to hang one on — the method takes and returns `string`, never a chord type or
   a struct.
2. `SetKeymap`'s doc comment names `normalizeChord` (TypeScript) as the sole authority on chord
   grammar and states the prohibition.
3. **`internal/settings/keymap_test.go` round-trips a document that is deliberately neither valid
   JSON nor a valid chord** (e.g. `{not json: alt++`) and asserts it returns byte-identical. Any
   future Go-side validation turns that test red. This converts a convention into a deterministic
   guard, which is this repo's stated norm; comments 1 and 2 alone would not.

| Rejected | Why |
|---|---|
| A Go validator / chord parser | A second grammar that drifts from `normalizeChord` the first time a chord rule changes, with the TypeScript one carrying 100% mutation coverage |
| One `app_settings` row per binding | `internal/settings` has `Get`/`Set` on an exact key and nothing else. Per-row needs a `LIKE 'keyboard.binding.%'` scan **and** a delete path — three new SQL shapes for a document always read and written whole |
| A generic bound `Get`/`Set` | Widens a deliberately narrow port to "any settings key" and lets the frontend write arbitrary rows. A typed pair matches the four already on `appSettingsStore` (`app.go:150-159`). No interface is renamed, so ADR-017's naming rule is untouched |

### D6 — Persist first, publish second

**Choice**: the store is updated **only** in the success branch of `setKeymap`.

**Rationale**: a user who rebinds, sees it take effect, restarts and finds it gone is worse off than
one whose rebind was refused with a visible reason. `useAutoStartPanel` already does exactly this —
`setEnabled(nextEnabled)` lives inside the `isAutoStartSaved(status)` success branch
(`use-auto-start-panel.ts:35-41`). Optimistic-then-rollback was rejected: it makes the dispatcher
briefly answer to a chord that was never stored.

### D7 — Capture by listening; `preventDefault()` is the suppression mechanism

**Choice**: an armed control records a keypress; `normalizeChord` is the only authority on what it
produced. The capture control's own `onKeyDown` calls `event.preventDefault()` **first,
unconditionally**. React 18 delegates at `#root`, which sits below `window` in the native bubble
path, so the dispatcher's guard 1 (`defaultPrevented`, `dispatch.helpers.ts:82`) bails before
resolution. This is the identical mechanism ADR-019 §3 documents and
`KeyboardDispatcherListener.react-aria.test.tsx` already proves for HeroUI widgets.

Capture reuses the dispatcher's existing guards rather than adding suppression, with one exception
and one addition:

| Concern | Handling |
|---|---|
| Self-capture (`?` opening the overlay mid-recording) | Guard 1, via the control's `preventDefault()`. **No dispatcher change** |
| `isTypingTarget` (guard 3) | Does **not** apply: the armed control is a `Button`, not an `<input>`/`contenteditable`/`role="textbox"`. Guard 1 is the load-bearing one |
| IME composition | Added locally: the handler returns without recording when `event.nativeEvent.isComposing`, mirroring guard 2 |
| Modifier held alone | `normalizeChord` returns `null` → stay armed, record nothing. No extra code |
| **Cancel** | `event.key === 'Escape'` is special-cased **before** normalization: disarm, record nothing. Escape is React Aria's universal dismiss, and a bindable Escape would be impossible to cancel out of |
| Focus leaves while armed | Disarm on blur. An armed-but-unfocused control is a lie: the next keystroke would reach a different element and fire normally |

| Rejected | Why |
|---|---|
| `stopPropagation()` alongside `preventDefault()` | Not relied upon. Its interaction with React's root delegation and a `window` listener is **not proven in this repo**, while `preventDefault()` has a passing test. Adding an unproven second mechanism makes the failure mode harder to reason about, not safer |
| A `keymap-capture` scope frame | A frame only shadows chords it **declares**, so it cannot swallow an arbitrary keystroke |
| `KeyboardScopeFrame.exclusive` | ADR-019's own consequences say it needs a second real consumer first. Capture does not need it |
| Select-from-a-list UI | Needs a second, hand-maintained enumeration of every key token, drifting from `normalizeChord` on the first rule change |

### D8 — Duplicates block; cross-scope shadowing warns; there is no second duplicate checker

**Choice**: at bind time, build the candidate and consult two helpers in a fixed order.

```
candidate  = pruneKeymap({ ...overrides, [id]: chord }, ALL_BINDINGS)
resolved   = resolveKeymap(ALL_BINDINGS, candidate)
findDuplicateBindings(resolved)   -> non-empty  => REFUSE, name the colliding labels, stay armed
findShadowedBindings(resolved)    -> non-empty  => SAVE, then warn with the exact consequence
```

`findDuplicateBindings` keys on `` `${scope}::${chord}` `` (`registry.helpers.ts:41`). A scoped
override colliding with a **global** chord is therefore not a duplicate by that key — **and must not
be**, because `resolveCommand` deliberately gives the innermost frame the win (ADR-019 §1). So the
cross-scope case is a **shadowing warning**, a different question with a different answer:

```ts
/** A chord claimed in more than one scope: the scoped claimants win while their scope is mounted. */
export interface ShadowedBinding {
  readonly chord: Chord;
  readonly scopedIds: readonly string[];
  readonly globalIds: readonly string[];
}

export function findShadowedBindings(bindings: readonly CommandBinding[]): readonly ShadowedBinding[];
```

It lives beside `findDuplicateBindings` in `registry.helpers.ts`, groups by **chord alone**, and
reports only groups spanning more than one scope. It is not a second duplicate checker: same-scope
collisions are blocked before it is ever consulted, so the two can never disagree. Writing one
checker that blurred the two would contradict resolution semantics.

### D9 — Hazards are advisory; the evidence-backed family gets a row chip, the unverified one gets one legend

**Choice**: `findChordHazard(chord): ChordHazard | null`, derived at display time, never stored.

| Hazard | Family | Evidence | Surfaced as |
|---|---|---|---|
| `browser-zoom` | `ctrl+0`, `ctrl+numpad0`, `ctrl++`, `ctrl+=`, `ctrl+-` and their numpad forms | **Known.** Chromium binds these to zoom, and WebView2 is Chromium | A per-row `Chip` on the affected row only |
| `unverified-delivery` | every `alt+` chord | **Unverified.** Nobody has confirmed an `alt+` chord reaches the packaged app. `?` is the only chord with positive runtime proof — the user opened the overlay in the real packaged build | **One legend below the map**, not a per-row chip |

The legend-not-chip split is the design decision, and it follows from the evidence: the *entire
shipped default keymap* is `alt+`-based, so a per-row chip would mark eleven of eleven rows and
convey nothing. One sentence stating that `alt+` delivery is unverified in the packaged build while
`?` is proven says strictly more, in one place.

Never blocking, in either family. Blocking a chord nobody has proven is swallowed would be inventing
evidence — and a blocking rule on `alt+` would refuse the keymap this app ships with.

**Why the feature is safe under either answer to the `Alt+<digit>` question** (the phase brief's
unverified input):

| If `Alt+<digit>` **is** delivered | If it is **not** |
|---|---|
| The legend is one line of muted text the user ignores. Nothing else changes | `alt+0` never opens Settings — but Settings is pointer-reachable from the rail, the panel is pointer-operable end to end, and reset is a pointer `Button` (D8/D10). The user can now **rebind out of the dead family themselves**, and the maintainer fix is still the one-line `NAV_COMMAND_CHORDS` data change SDD-61 identified |

This change therefore makes SDD-61's open question non-load-bearing, which is itself a mitigation
rather than a dependency.

### D10 — The panel lives in `shared/keyboard/ui/`, the map renders first, and it does not reuse the overlay's grouping

**Choice**: `frontend/src/shared/keyboard/ui/KeymapPanel/` plus a sibling
`ui/KeymapBindingRow/`, registered as one more `PREFERENCES_ROUTE_TABS` entry (appended last).

| Evidence | Consequence |
|---|---|
| `.dharness/fallow.jsonc` allows `shared -> infrastructure` and **not** `shared -> features` | A panel in `features/` would make `preferences-route.constants.ts` cross that boundary a fourth time |
| `.dharness/fallow.jsonc` already reports the three existing crossings as composition living in `shared` by accident | A `shared -> shared` import leaves the crossing count unchanged. Boundary findings are reported, not blocking, so this is hygiene rather than a gate — stated as such |
| `ui/ShortcutsHelpDialog/`, `ui/KeyboardDispatcherListener/`, `shared/ordering/ui/AnimeScheduleOrdering/` | Exact in-tree precedent; CLAUDE.md frontend #12b puts stateful shared widgets in `shared/<domain>/` |

**Order inside the panel** (D1 of the proposal, confirmed product decision): the complete map is the
first block. Per-row `Rebind`/`Revert` controls live **on the rows** — a row *is* the edit surface,
so the map being first and the affordances being reachable are the same thing. The only block below
the map is reset-to-defaults plus the hazard legend. Nothing is placed above the map, and no floating
`?` affordance or per-screen hint is added anywhere.

**The map lists the scoped binding too**, annotated with its scope ("while the Notification Center is
open"). Without the note a user presses `Alt+R` on Today, nothing happens, and concludes the map
lies.

**Rejected: reusing `toShortcutSections`.** The overlay's row is display-only
(`{id, label, display}`). A panel row additionally needs the raw chord, whether it is overridden, its
hazard and its scope note, so reuse would force a second join by id — more code than one grouping
helper, and the two surfaces would still not share a row type. The drift risk that actually matters
(do the overlay and the panel show the same chord?) is closed by both resolving through
`effectiveChord`, not by sharing a grouping function, and is pinned by R-8's test.

### D11 — The loader mounts where the dispatcher mounts; three states, one of them deliberately absent

**Choice**: `useKeymapOverrides()` is called from `KeyboardDispatcherListener`, beside
`useKeyboardDispatcher()`. That component already exists to hold keyboard runtime concerns at the app
shell, renders `null`, and lives in `shared/`; `AppLayout` stays composition-only per ADR-015, which
forbids hooks in `src/app/**`. Its JSDoc is updated to say it now holds two.

Two reads under `<React.StrictMode>` are harmless — both publish the same value — so there is no
module-level once-flag, which would also break the suite's ability to re-run the loader.

| Rejected | Why |
|---|---|
| A new `KeymapLoaderListener` component | A second null-rendering component for the same subsystem, requiring an `AppLayout` edit, with no benefit |
| Load inside `use-keymap-panel.ts` | The dispatcher would run on shipped defaults until the user opened Settings. That is the bug, not the design |

**The three states** (`autoreas-theme` → "Loading and empty states — MANDATORY"):

| State | Condition | Render |
|---|---|---|
| Unresolved | `isKeymapLoaded === false` | Skeleton rows mirroring the real row's shape, inside `<div aria-labelledby="keymap-loading-label" aria-live="polite" role="status">` with an `sr-only` span. Count from a named `KEYMAP_SKELETON_ROW_COUNT`. One shared `KEYMAP_ROW_CLASS` between the real row and the placeholder so heights cannot drift |
| Resolved, empty | **Unreachable by construction** | Not rendered. `KEYBOARD_COMMANDS` is a compile-time array of eleven entries plus one scoped binding, so an `AirisEmptyState` here would be dead code that `fallow audit` flags. The assumption is pinned by a test asserting the binding list is non-empty, so it cannot silently become false |
| Failed | A save returned a non-`ok` status, or the read rejected | The panel's error `Alert`. Never a skeleton, never an empty state |

The states are **exclusive**: the content branch is gated on `isKeymapLoaded`, never on the row
count (`isKeymapLoaded ? rows.map(…) : null`), because a refetching surface has both a pending
request and previous rows.

**The loader always resolves to `isKeymapLoaded: true`**, including on a rejected promise or an
unparseable document. A rejection that left the flag false would strand the panel on a permanent
skeleton.

**Binding unavailable**: `getKeymap`/`setKeymap` follow their neighbours exactly —
`waitForBindings(() => hasGoBinding('GetKeymap'))`, degrading to `''` on read and
`'runtime unavailable'` on write. A degraded read is indistinguishable from unset and behaviourally
identical (shipped defaults). A degraded write surfaces its status string in the error `Alert` and
leaves `overrides` untouched (D6), so the panel never claims a rebind that was not stored.

### D12 — Amend ADR-019 **and** add ADR-020

**Choice**: both, split by the kind of edit.

| Edit | Where | Why not the other document |
|---|---|---|
| A **factual correction** to an Accepted ADR | ADR-019, in place | ADR-019's separability framing is true for the ten navigation commands (chords live in the `NAV_COMMAND_CHORDS` data table) and was **false** for scoped commands, whose chord was inline in `use-notification-keyboard-scope.ts:28`. An ADR is immutable as to its *decision*, not as to a factual error in its *description*. Leaving the error standing with only a forward pointer means a reader who finds 019 first believes it |
| A **new decision** with its own rejected alternatives | New `docs/adr/020-keymap-override-seam.md` | The store-read seam, `effectiveChord` vs. per-keystroke `resolveKeymap`, Go-as-opaque-pipe, capture-by-listening, duplicates-block/shadows-warn, and advisory-not-blocking hazards are six new alternatives-rejected records. Burying them inside an ADR about a different decision would make 019 unreadable |

Exactly what changes in ADR-019:

1. Header gains `- **Amended**: 2026-09-11 by ADR-020 (keymap override seam)`.
2. §1's table row on remapping gains the scoped-command exception, naming
   `SCOPED_COMMAND_BINDINGS` as what made separability true rather than aspirational.
3. "Alternatives considered" → the `key -> callback` entry keeps its text, with one added sentence:
   019 made remapping *possible*, SDD-62 shipped it.
4. Consequences gain: `KEYBOARD_COMMANDS` is the **default** keymap, not the effective one, and the
   three call sites that must resolve through overrides are named.

---

## 3. Interfaces / Contracts

### Frontend (new)

```ts
// shared/keyboard/keymap.types.ts
export type KeymapOverrides = Readonly<Record<string, Chord>>;
export interface KeymapDocument { readonly version: 1; readonly bindings: KeymapOverrides; }
export type ChordHazard = 'browser-zoom' | 'unverified-delivery';

// shared/keyboard/keymap.helpers.ts  (pure — no registry import, no DOM)
export function effectiveChord(binding: CommandBinding, overrides: KeymapOverrides): Chord;
export function resolveKeymap<T extends CommandBinding>(bindings: readonly T[], overrides: KeymapOverrides): readonly T[];
export function parseKeymap(raw: string): KeymapOverrides;            // degrades to {} (D4)
export function serializeKeymap(overrides: KeymapOverrides): string;  // '' when empty -> clears the row
export function pruneKeymap(overrides: KeymapOverrides, bindings: readonly CommandBinding[]): KeymapOverrides;
export function findChordHazard(chord: Chord): ChordHazard | null;

// shared/keyboard/registry.helpers.ts  (beside findDuplicateBindings)
export function findShadowedBindings(bindings: readonly CommandBinding[]): readonly ShadowedBinding[];
```

`keymap.helpers.ts` imports nothing from the registry, so its suite lands in the **node** Vitest
project automatically: `vite.config.ts`'s `nodeTestInclude` already globs
`src/shared/**/__tests__/*.helpers.test.ts`. No config change. The registry-assembling helper
(`listAllBindings`, joining `KEYBOARD_COMMANDS` with `Object.values(SCOPED_COMMAND_BINDINGS)`) lives
in `keymap-panel.helpers.ts` where its only consumer is.

### Frontend (modified)

```ts
// keyboard.types.ts — KeyboardStoreState
readonly overrides: KeymapOverrides;   // {} until loaded and whenever no override exists
readonly isKeymapLoaded: boolean;      // false until the persisted document resolves (D11)

// dispatch.helpers.ts
export function resolveCommand(
  chord: Chord,
  frames: readonly KeyboardScopeFrame[],
  commands: readonly CommandDefinition[],
  overrides: KeymapOverrides,            // <- required, D2
): CommandDefinition | null;

// infrastructure/preferences-source/preferences-source.types.ts — PreferencesSource
readonly getKeymap: () => Promise<string>;
readonly setKeymap: (document: string) => Promise<string>;
```

### Go

```go
// internal/settings/store.go
const keyKeymap = "keyboard.keymap"
func (s *SQLiteStore) Keymap(ctx context.Context) (string, error)
func (s *SQLiteStore) SetKeymap(ctx context.Context, document string) error

// internal/desktop/app.go — appSettingsStore gains the same pair
// internal/desktop/app_preferences.go — nil-tolerant bound methods
func (a *App) GetKeymap() string            // "" when the store is unavailable
func (a *App) SetKeymap(document string) string  // "ok" | error string
```

---

## 4. Sequence Diagrams

### 4.1 One keystroke with an override applied (`nav.today` rebound `alt+1` -> `ctrl+1`)

```
user            window            dispatch.helpers        keyboardStore      registry
 │ Ctrl+1        │                      │                      │                │
 ├──keydown─────>│ (bubble)             │                      │                │
 │               ├─dispatchKeyboardEvent│                      │                │
 │               │   guard1 defaultPrevented? no                │                │
 │               │   guard2 isComposing? no                     │                │
 │               │   guard3 isTypingTarget? no                  │                │
 │               │   normalizeChord(event) ──> 'ctrl+1'         │                │
 │               │   getKeyboardState() ───────────────────────>│  (line 99,
 │               │   <── { frames, overrides:{'nav.today':'ctrl+1'} }   already there)
 │               │   resolveCommand('ctrl+1', frames, KEYBOARD_COMMANDS, overrides)
 │               │     frames innermost-first:                  │                │
 │               │       effectiveChord(cmd, overrides) === 'ctrl+1' ? no        │
 │               │     globals: ───────────────────────────────────────────────> │
 │               │       effectiveChord({id:'nav.today', chord:'alt+1'}, …)      │
 │               │         -> 'ctrl+1'  MATCH <──────────────────────────────────│
 │               │   command.enabled?.() -> undefined           │                │
 │               │   event.preventDefault()                     │                │
 │               │   command.run({ navigate }) -> navigate('/today')             │
```

`Alt+1` afterwards: no binding's effective chord is `alt+1`, so `resolveCommand` returns `null` and
the dispatcher returns at the `command === null` guard **without** calling `preventDefault()` — the
key falls through to the browser, which is today's behaviour for an unbound chord, unchanged.

### 4.2 One rebind, from press to persisted

```
user        KeymapBindingRow   use-chord-capture   use-keymap-panel   PreferencesSource   Go/SQLite
 │ press Rebind    │                  │                   │                  │              │
 ├────onPress─────>├──arm(id)────────>│ isArmed=true      │                  │              │
 │ Ctrl+1          │                  │                   │                  │              │
 ├────onKeyDown───>│─────────────────>│ preventDefault()  │                  │              │
 │                 │                  │ isComposing? no   │                  │              │
 │                 │                  │ key==='Escape'? no│                  │              │
 │                 │                  │ normalizeChord -> 'ctrl+1'           │              │
 │                 │                  ├──onCaptured──────>│                  │              │
 │  (window keydown arrives later in the same native dispatch:               │              │
 │   dispatchKeyboardEvent bails at guard 1 — nothing fires)                 │              │
 │                 │                  │  candidate = prune({…overrides, id:'ctrl+1'})       │
 │                 │                  │  resolved  = resolveKeymap(ALL_BINDINGS, candidate) │
 │                 │                  │  findDuplicateBindings(resolved)     │              │
 │                 │                  │    non-empty -> REFUSE, name labels, stay armed ────┤ (no write)
 │                 │                  │  findShadowedBindings(resolved) -> warn text        │
 │                 │                  ├──setKeymap(serializeKeymap(candidate))─>│           │
 │                 │                  │                   │    App.SetKeymap ──┼──Set(     │
 │                 │                  │                   │                    │   "keyboard.keymap",
 │                 │                  │                   │                    │   opaque json)
 │                 │                  │                   │<──'ok'─────────────┤           │
 │                 │                  │  setKeymapOverrides(candidate)  (D6: success only)  │
 │                 │                  │  toast.success; disarm; warn if shadowed            │
 │                 │                  │<── non-'ok': errorMessage=status, toast.danger,     │
 │                 │                  │    overrides UNCHANGED                              │
```

Reset-to-defaults is the same path with `setKeymap('')` and `setKeymapOverrides({})`; per-row revert
is the same path with the id deleted from `overrides`.

---

## 5. File Changes

| File | Action | What, and the size target (warn 400 / fail 500 effective lines) |
|---|---|---|
| `frontend/src/shared/keyboard/keymap.types.ts` | Create | `KeymapOverrides`, `KeymapDocument`, `ChordHazard`, `ShadowedBinding`. ~45 |
| `frontend/src/shared/keyboard/keymap.helpers.ts` | Create | The six pure functions of §3. No registry import, no DOM. ~130 |
| `frontend/src/shared/keyboard/keymap.constants.ts` | Create | `SCOPED_COMMAND_BINDINGS`, `KEYMAP_DOCUMENT_VERSION`, `BROWSER_ZOOM_CHORDS`, `UNVERIFIED_DELIVERY_PATTERN`. ~70 |
| `frontend/src/shared/keyboard/keyboard.types.ts` | Modify | `CommandBinding` extracted; `CommandDefinition extends` it; store gains `overrides` + `isKeymapLoaded`. ~+25 |
| `frontend/src/shared/keyboard/keyboard.constants.ts` | Modify | `keyboardStore` initial state gains both fields. ~+4 |
| `frontend/src/shared/keyboard/keyboard-scope.helpers.ts` | Modify | `setKeymapOverrides`; `resetKeyboardStore` clears both. ~+15 |
| `frontend/src/shared/keyboard/dispatch.helpers.ts` | Modify | Destructure `overrides` at line 99; `resolveCommand` gains the required param and compares via `effectiveChord`. ~+12 |
| `frontend/src/shared/keyboard/registry.helpers.ts` | Modify | Parameters widened to `CommandBinding`; add `findShadowedBindings`. ~+35 |
| `frontend/src/shared/keyboard/use-keymap-overrides.ts` | Create | Loads once, parses, publishes, always sets `isKeymapLoaded`. ~55 |
| `frontend/src/shared/keyboard/ui/KeyboardDispatcherListener/KeyboardDispatcherListener.tsx` | Modify | Second hook call + JSDoc. ~+4 |
| `frontend/src/shared/keyboard/ui/ShortcutsHelpDialog/use-shortcuts-help-dialog.ts` | Modify | Read `overrides`; resolve before grouping. ~+8 |
| `frontend/src/shared/keyboard/ui/KeymapPanel/KeymapPanel.tsx` | Create | Dumb: status region + skeletons, map first, reset + legend below, error `Alert`. ~150 |
| `frontend/src/shared/keyboard/ui/KeymapPanel/use-keymap-panel.ts` | Create | Effective rows, conflict/shadow derivation, persistence, revert, reset. ~170 |
| `frontend/src/shared/keyboard/ui/KeymapPanel/use-chord-capture.ts` | Create | The armed/record/cancel/blur state machine. Its own hook so `use-keymap-panel.ts` stays under 400. ~90 |
| `frontend/src/shared/keyboard/ui/KeymapPanel/keymap-panel.{types,constants,helpers}.ts` | Create | Props, copy, `KEYMAP_ROW_CLASS`, `KEYMAP_SKELETON_ROW_COUNT`, `listAllBindings`, section grouping. ~180 total |
| `frontend/src/shared/keyboard/ui/KeymapBindingRow/` | Create | One row: label, effective chord, hazard `Chip`, scope note, `Rebind`, `Revert`. Sibling, not nested — matches the flat `ui/` convention. ~120 |
| `frontend/src/shared/preferences/preferences-route.constants.ts` | Modify | One `PREFERENCES_ROUTE_TABS` entry, appended last. `shared -> shared`. ~+7 |
| `frontend/src/features/notifications/ui/NotificationCenterPanel/use-notification-keyboard-scope.ts` | Modify | Spreads `SCOPED_COMMAND_BINDINGS['notification-center.mark-all-read']` instead of the inline chord. ~+3/-5 |
| `frontend/src/infrastructure/preferences-source/preferences-source.{types,helpers}.ts` | Modify | `getKeymap`/`setKeymap`, guarded like every neighbour. ~+18 |
| `internal/settings/store.go` | Modify | `keyKeymap`, `Keymap`, `SetKeymap`. ~+16 |
| `internal/settings/keymap_test.go` | Create | Round-trip + the opaque-bytes guard (D5.3). ~90 |
| `internal/desktop/app.go` | Modify | Two port methods. ~+2 |
| `internal/desktop/app_preferences.go` | Modify | Two nil-tolerant bound methods. ~+22 |
| `internal/desktop/app_keymap_test.go` | Create | Nil store, error path, `"ok"`, opaque pass-through. ~110 |
| `docs/adr/019-keyboard-command-registry.md` | Modify | The four edits in D12 |
| `docs/adr/020-keymap-override-seam.md` | Create | D1, D2, D5, D7, D8, D9 with their rejected alternatives |
| `.claude/skills/keyboard-shortcuts/SKILL.md` | Modify | "Known limits" remapping row becomes shipped; new override/`SCOPED_COMMAND_BINDINGS` section; version bump |
| `CLAUDE.md` / `AGENTS.md` note 23 | Modify | Amend with the override seam |
| `docs/learning-log.md` | Append | `node scripts/log-lesson.mjs` only, never by hand (CLAUDE.md #17) |
| `frontend/wailsjs/go/desktop/App.{d.ts,js}` | Regenerated, not committed | Gitignored. Apply-time gotcha: `tsc` fails on the new import until `wails dev`/`wails build` regenerates them |
| `docs/openapi.yaml`, mobile sync contract, SQLite schema | **Untouched** | Desktop-only binding; `app_settings` already exists in `internal/sync/schema_tables.go`. No migration |

No file is projected above ~180 effective lines. The two that could have crossed 400 are split by
construction: capture is its own hook (D7/§5), and the row is its own component.

---

## 6. Testing Strategy

Strict TDD (`openspec/config.yaml` `strict_tdd: true`): RED → GREEN → **MUTATE** → REFACTOR per
CLAUDE.md #16.

| Layer | What to prove | How |
|---|---|---|
| Pure unit (node project) | `effectiveChord` / `resolveKeymap`: override applied, absent id untouched, orphan id never resurrects a command, no-op override is identity | Table-driven, `shared/keyboard/__tests__/keymap.helpers.test.ts` (auto-lands in `node` via `nodeTestInclude`) |
| Pure unit (node project) | `parseKeymap` degrade matrix: `''`, garbage, `null`, array, wrong `version`, `bindings` missing, `bindings` not an object, non-string chord value — every one yields `{}` and never throws | Table-driven, one case per malformed shape (R-7) |
| Pure unit (node project) | `pruneKeymap` drops orphans and no-ops; `serializeKeymap({})` returns `''` | Table-driven |
| Pure unit (node project) | `findShadowedBindings` reports cross-scope chord groups and **never** reports a same-scope collision; `findDuplicateBindings` still finds same-scope collisions after widening | Table-driven, both in `registry.helpers.test.ts` |
| Pure unit (node project) | `findChordHazard`: the zoom family, the `alt+` family, `?` -> `null`, precedence when both could match | Table-driven |
| Dispatcher unit | An override makes the new chord fire and the old chord fire **nothing**, with no `preventDefault()` on the now-unbound chord; an override on a **scoped** command applies inside its frame | Extend `dispatch.helpers.test.ts` |
| Store unit | `setKeymapOverrides` publishes; `resetKeyboardStore` clears `overrides` **and** `isKeymapLoaded` | `keyboard-scope.helpers.test.ts` |
| Hook (jsdom) | `use-keymap-overrides`: `''` -> `{}`, valid document -> overrides, garbage -> `{}`, rejected promise -> `{}`; `isKeymapLoaded` becomes true in **all four** | `renderHook` with an injected source |
| Hook (jsdom) | `use-chord-capture`: records `ctrl+1`; `Escape` cancels and records nothing; a modifier alone keeps it armed; blur disarms; `preventDefault` called on every keydown while armed | `renderHook` + `fireEvent.keyDown` |
| Component (jsdom) | **Capture suppression (R-4)**: fire `?` and `alt+1` into the armed control and assert no command ran and the overlay did not open. Mirrors `KeyboardDispatcherListener.react-aria.test.tsx` — a real event, not a mock |
| Component (jsdom) | **Loading triad**: `getByRole('status', { name })` while unresolved **and the negative** — no real binding row is present; both region and skeletons gone once settled, on success **and** on failure |
| Component (jsdom) | Map is the **first** block; the scoped `Alt+R` row is present with its scope note; a same-scope collision is refused and names the colliding label; a cross-scope collision saves and warns |
| Component (jsdom) | **Recovery is a requirement, not an affordance (D8)**: reset and per-row revert both driven by `userEvent.click` only — no keyboard chord anywhere in the test — and the shipped keymap returns exactly |
| Cross-surface (jsdom) | **R-8**: set one override, assert the dispatcher and the `?` overlay both show/honour it | One test, two assertions |
| Scoped-metadata guard (jsdom) | **R-6**: `use-notification-keyboard-scope.test.ts` asserts the registered chord equals `SCOPED_COMMAND_BINDINGS[…].chord`, so a wrong-source regression is red |
| Registry guard | The binding list is non-empty, pinning D11's unreachable-empty-state assumption |
| Go unit | `Keymap`/`SetKeymap` round-trip; missing row -> `""`; `SetKeymap("")` clears; **the opaque-bytes guard**: a document that is neither valid JSON nor a valid chord returns byte-identical (D5.3) | `t.TempDir()` + real SQLite, table-driven per `go-testing` |
| Go unit | `App.GetKeymap` with a nil store -> `""`; `App.SetKeymap` with a nil store -> `"settings store unavailable"`; store error -> the error string; success -> `"ok"` | Injected fake port |
| Mutation | Frontend: `bun --cwd="frontend" run test:mutation:staged`, isolated to the new files — a repo-blended score hides survivors. Go: `ditto staged --exclude-prefix frontend/ --threshold 0.80 --test-command "go test -count=1 -json ./internal/settings/"`, then `./internal/desktop/`. The owning package is named, never `./...` (CLAUDE.md #16) |
| Render smoke | `bun --cwd="frontend" run render:smoke`. The panel is a **tab inside `/settings`**, an existing route, so **no** `ROUTE_MARKERS` entry is added — recorded so verify reads its absence as correct (R-11) |

**Mutation notes carried forward from SDD-61**: never assert against the production symbol being
pinned — write expected chords as literals (`'ctrl+1'`, not `NAV_COMMAND_CHORDS['/today']`). The one
deliberate inversion stays as-is: the nav-command test derives from `APP_LAYOUT_NAV_GROUPS` on
purpose. `// Stryker disable next-line` does not reach a trailing call-expression argument such as a
deps array — document an equivalent mutant in prose instead.

---

## 7. Threat Matrix

**N/A — this design introduces no routing, shell, subprocess, VCS/PR-automation,
executable-file-classification, or process-integration boundary.** Every row of
`sdd-design/references/threat-matrix.md` is therefore `N/A`, and no task is manufactured for one.

Routing deserves its explicit reason rather than a bare `N/A`: an override changes only a binding's
`chord` field. A nav command's `run` is `navigate(item.to)` with a compile-time path from
`APP_LAYOUT_NAV_GROUPS` (`registry.helpers.ts:28`), so **no persisted value is ever navigated to,
executed, or interpolated into a path**.

There is one real boundary, and it is untrusted-input-shaped rather than threat-matrix-shaped:

| Boundary | Contract |
|---|---|
| `app_settings["keyboard.keymap"]` is hand-editable, so the document is **untrusted input** reaching the frontend | `parseKeymap` is total: it returns `KeymapOverrides` or `{}`, never throws, never partially applies (D4). Values are consumed **only** as strings compared against `normalizeChord` output — never as keys into a behaviour table, never as a path, never as HTML. A document with a thousand unknown ids resolves to the shipped keymap, because resolution iterates bindings and not the document |

---

## 8. Migration / Rollout

**No migration.** `app_settings` already exists (`internal/sync/schema_tables.go`); the change adds
one key, and an absent key is the canonical default state. No schema change, no wire contract, no
data to convert.

Six stacked slices under the cached `auto-chain` / `stacked-to-main` strategy, each independently
mergeable and each leaving the app working:

| Slice | Content | Left inert by |
|---|---|---|
| 62a | `keymap.{types,helpers,constants}.ts`, `CommandBinding` split, `findShadowedBindings` | Nothing reads them yet — the colocated tests are the consumers `fallow audit` requires |
| 62b | Go pair, port methods, bound methods, `PreferencesSource` pair | Nothing calls them yet |
| 62c | Store fields, dispatcher + overlay resolution, loader hook, `SCOPED_COMMAND_BINDINGS` adoption | Overrides are `{}` with nothing writing them, so `resolveKeymap` is the identity function |
| 62d | Read-only map rendered first, tab entry, loading triad | No editing affordance yet |
| 62e | Capture, conflict/shadow surfacing, revert, reset | — |
| 62f | ADR-019 amendment, ADR-020, skill + note 23, learning-log line | — |

`sdd-tasks` owns the final split and MUST emit the §E guard lines. 62d and 62e are each forecast
above the 400-line budget; a plausible sub-split is 62d into "map + tab entry" / "the three states",
and 62e into "capture" / "conflict + recovery".

**Rollback**: behaviour returns to shipped defaults the moment overrides stop being read — an empty
`overrides` makes `resolveKeymap` the identity function. Per-slice residue is in `proposal.md` §9;
the one coupling is that 62c's revert must include `use-notification-keyboard-scope.ts` in the same
commit, because `SCOPED_COMMAND_BINDINGS` reverts with it.

**Deliberate consequence, not a bug**: `internal/desktop/app_backup.go:37-41` states that only
`anime_snapshots`, `seasons` and `season_animes` are exported, and that machine-local `app_settings`
is "excluded by never appearing here, not by a flag or a comment". **A customized keymap therefore
does not travel in a backup bundle**, and reinstalling loses it. That exclusion is respected rather
than fixed: a keymap tuned to one physical keyboard and layout should not follow a bundle onto
another machine, where the chords it encodes may not even be reachable. Recorded here so the next
reader does not file it as a defect.

---

## 9. Known Ordering Blocker (not this phase's to solve)

`openspec/specs/keyboard-shortcuts/spec.md` **does not exist**. SDD-61 is unarchived, so its spec
lives only at `openspec/changes/2026-09-10-sdd-61-keyboard-shortcuts/specs/keyboard-shortcuts/spec.md`.
SDD-62's delta for the modified `keyboard-shortcuts` capability must be authored against that file
and must target the main spec once 61 archives; the two MUST archive in order (61, then 62). This
design assumes the main spec does **not** exist. That is `sdd-spec`'s and `sdd-archive`'s problem
(R-1), stated here so neither phase rediscovers it.

Additionally: SDD-61's slices were **still being applied while this design was written** — a
`use-keyboard-scope.ts` and a `use-notification-keyboard-scope.ts` edit landed during the phase. Every
`file:line` above was read from disk during this phase, but `sdd-tasks`/`sdd-apply` MUST re-read
`frontend/src/shared/keyboard/` rather than trusting these line numbers.

---

## 10. Open Questions

- [ ] **Whether any `alt+` chord is delivered in the packaged app.** Unverified; needs a human on
      `wails build` plus the packaged binary. jsdom cannot prove it. **Not load-bearing** by D9: the
      feature is fully pointer-operable under either answer, and this change hands the user the
      ability to rebind out of a dead family.
- [ ] **Tab order.** The Shortcuts tab is appended last (Downloads, Backup, Startup, Shortcuts).
      `PREFERENCES_ROUTE_TABS` array order is tab order, so moving it is a one-line change. The
      confirmed decision constrains order *inside* the panel, not tab order.

Considered and **closed**, recorded so they are not reopened as questions:

- **`?` is itself rebindable**, because it is an entry in `KEYBOARD_COMMANDS` and nothing special-cases
  it. Rebinding it to an un-deliverable chord makes the overlay unreachable by keyboard — acceptable,
  because the Settings map is now the discoverability surface the overlay was failing to be, and
  reset-to-defaults is a pointer `Button`.
- **Resolved-empty has no UI**, by construction and with a test pinning the assumption (D11).
