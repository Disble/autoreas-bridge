# Keyboard Shortcuts Specification

## Purpose

Defines the keyboard shortcuts infrastructure: a typed command registry, pure chord
normalization/formatting, a scope stack readable outside React, one global dispatcher with guard
conditions, ten global navigation commands, the Notification Center's route-scoped "mark all as
read", and a help dialog derived from the registry. Frontend-only.

## Requirements

### Requirement: The Command Registry Is A Typed, Duplicate-Free Source Of Truth

The system MUST define commands in one registry (id, scope, chord, label, section, `enabled()`,
`run()`) used for dispatch resolution, conflict detection, and the help dialog. No two entries
MUST share the same `{scope, chord}` pair.

#### Scenario: A duplicate `{scope, chord}` binding fails the test suite

- GIVEN two registry entries share a `scope` and `chord`
- WHEN the duplicate-detection test runs over the shipped registry
- THEN it MUST fail, naming both conflicting command ids

#### Scenario: Every entry declares a section

- GIVEN the shipped registry
- WHEN entries are inspected
- THEN each MUST declare a non-empty `section` used to group it in the help dialog

### Requirement: Chord Normalization And Display Formatting Are Pure Functions

The system MUST provide a pure function from a `KeyboardEvent` to a canonical chord string, and its
inverse from a chord to a display string. Neither MUST read or write shared state.

#### Scenario: A `KeyboardEvent` normalizes to a canonical chord

- GIVEN a `KeyboardEvent` for Ctrl+K
- WHEN it is normalized
- THEN the result MUST be one canonical chord string

#### Scenario: A canonical chord formats for display

- GIVEN the canonical chord for Ctrl+K
- WHEN it is formatted
- THEN the result MUST be a human-readable string

### Requirement: The Scope Stack Resolves Commands Innermost-First, Gated By `enabled()`

The active scope MUST live in a vanilla store readable via `.getState()` outside React's render
cycle. Pushing a scope makes it innermost; popping restores the prior scope. Resolution for a given
chord MUST check the innermost scope first, falling back to global. A matched command whose
`enabled()` returns `false` MUST NOT run.

#### Scenario: Popping a scope restores the previous scope

- GIVEN global is active and a route scope is pushed
- WHEN the route scope is popped
- THEN global MUST become active again

#### Scenario: An unclaimed chord falls back to global

- GIVEN the active route scope defines no command for a chord
- WHEN that chord is pressed
- THEN the matching global command, if any, MUST run

#### Scenario: A matched but disabled command does not run

- GIVEN a command's `enabled()` returns `false` for the active scope and chord
- WHEN that chord is pressed
- THEN `run()` MUST NOT be called

### Requirement: Exactly One Global Dispatcher Bails On Four Guard Conditions

The system MUST mount exactly one `keydown` listener, removed on unmount with the same reference it
was added with. It MUST NOT invoke a command when `event.defaultPrevented` is `true`; the target is
an `input`, `textarea`, or `contenteditable`; `event.isComposing` is `true`; or no command matches
`{activeScope, chord}`.

#### Scenario: A rendered HeroUI `Table` or `Select` retains its own key handling

- GIVEN a real HeroUI `Table` or an open `Select` receives and claims (`defaultPrevented`) a key it
  owns
- WHEN the global dispatcher observes the same event
- THEN it MUST NOT invoke any command for that chord
- AND the widget's own behavior MUST NOT double-trigger

#### Scenario: Typing into a text field suppresses dispatch

- GIVEN focus is inside an `input`, `textarea`, or `contenteditable`
- WHEN a bound chord is pressed
- THEN the dispatcher MUST NOT invoke that command

#### Scenario: An IME composition in progress suppresses dispatch

- GIVEN `event.isComposing` is `true`
- WHEN a bound chord is pressed
- THEN the dispatcher MUST NOT invoke that command

### Requirement: Ten Global Navigation Commands Are Derived From The Nav Constant

The system MUST register one global command per entry in `APP_LAYOUT_NAV_GROUPS`, with test cases
derived from that constant rather than hand-listed.

#### Scenario: Every nav route has exactly one bound command

- GIVEN `APP_LAYOUT_NAV_GROUPS` and the shipped registry
- WHEN a test derives expected commands from the constant
- THEN every route MUST have exactly one bound global command, and an unbound addition MUST fail

### Requirement: "Mark All As Read" Is Route-Scoped To The Notification Center, Never Global

The system MUST register "mark all as read" under the Notification Center's scope, active only
while that panel is mounted, and MUST NOT register it globally.

#### Scenario: The command fires only while the panel's scope is active

- GIVEN the Notification Center panel is mounted and its scope pushed
- WHEN its bound chord is pressed
- THEN mark-all-read MUST run for the panel's currently loaded rows

#### Scenario: The command is absent once the panel unmounts

- GIVEN the panel is unmounted and its scope popped
- WHEN the same chord is pressed
- THEN no command MUST run for it in the global scope

### Requirement: The Shortcuts Help Dialog Renders Content Derived From The Registry

The help dialog MUST render its grouped bindings by reading the command registry, not a separately
maintained list.

#### Scenario: A newly registered command appears without a dialog code change

- GIVEN a new command is added to the registry with a `section`, `chord`, and `label`
- WHEN the help dialog renders
- THEN the command MUST appear under its section with no change to the dialog's own code
