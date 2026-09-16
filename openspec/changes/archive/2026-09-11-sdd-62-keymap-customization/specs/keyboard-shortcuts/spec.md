# Delta for Keyboard Shortcuts

## MODIFIED Requirements

### Requirement: The Scope Stack Resolves Commands Innermost-First, Gated By `enabled()`

The active scope MUST live in a vanilla store readable via `.getState()` outside React's render
cycle. Pushing a scope makes it innermost; popping restores the prior scope. Resolution for a given
chord MUST check the innermost scope first, falling back to global, comparing against each command's
**effective** chord — its stored user override if one exists for the command's id, otherwise its
declared chord. A matched command whose `enabled()` returns `false` MUST NOT run.

(Previously: resolution compared only each command's declared chord; there was no override layer.)

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

#### Scenario: A rebound command fires on its new chord and not its old one
- GIVEN a global command has a user override changing its chord
- WHEN the overridden chord is pressed
- THEN that command MUST run, and pressing the command's original declared chord MUST NOT run it

### Requirement: "Mark All As Read" Is Route-Scoped To The Notification Center, Never Global

The system MUST register "mark all as read" under the Notification Center's scope, active only
while that panel is mounted, and MUST NOT register it globally. Its id, scope, chord, label, and
section MUST be declared in one place shared across the app, so the binding is enumerable even
while the panel is not mounted.

(Previously: its chord metadata was declared inline inside the feature hook and was enumerable
only while the panel was mounted.)

#### Scenario: The command fires only while the panel's scope is active
- GIVEN the Notification Center panel is mounted and its scope pushed
- WHEN its bound chord is pressed
- THEN mark-all-read MUST run for the panel's currently loaded rows

#### Scenario: The command is absent once the panel unmounts
- GIVEN the panel is unmounted and its scope popped
- WHEN the same chord is pressed
- THEN no command MUST run for it in the global scope

#### Scenario: The binding is enumerable without the panel being mounted
- GIVEN the Notification Center panel is not mounted
- WHEN the shared command metadata is read
- THEN the mark-all-read binding's id, chord, label, and section MUST be present

### Requirement: The Shortcuts Help Dialog Renders Content Derived From The Registry

The help dialog MUST render its grouped bindings by reading the command registry, not a separately
maintained list, resolving each binding's displayed chord through the same effective-chord rule the
dispatcher uses.

(Previously: the dialog displayed each command's declared chord directly; there was no override
layer to resolve against.)

#### Scenario: A newly registered command appears without a dialog code change
- GIVEN a new command is added to the registry with a `section`, `chord`, and `label`
- WHEN the help dialog renders
- THEN the command MUST appear under its section with no change to the dialog's own code

#### Scenario: An overridden chord displays identically to what the dispatcher answers to
- GIVEN a command has a user override
- WHEN the help dialog renders
- THEN it MUST display the overridden chord, and that chord MUST match the one the dispatcher now resolves for the same command
