# Keymap Customization Specification

## Purpose

Lets a user rebind any global or scoped keyboard command's chord, see the complete shortcut map in
one place, and always recover a working keymap without touching a keyboard. Builds on
`keyboard-shortcuts`: the frontend owns the override grammar end to end; the backend persists it as
an opaque document.

## Requirements

### Requirement: The Keymap Document Is Versioned And Degrades Safely

The system MUST persist user overrides as one versioned document. An unreadable, wrong-version, or
malformed document MUST degrade to an empty override set, never a crash or a partial application.

#### Scenario: A valid document parses into overrides
- GIVEN a persisted document with a matching version and a command-id-to-chord binding
- WHEN the document is loaded
- THEN that override MUST be available for resolution

#### Scenario: A malformed document degrades to no overrides
- GIVEN a persisted value that is not valid JSON, not an object, has a mismatched version, or holds a non-string chord
- WHEN the document is loaded
- THEN the system MUST apply no overrides and MUST NOT throw or partially apply it

#### Scenario: An absent document behaves identically to an explicit empty one
- GIVEN no document has ever been saved
- WHEN the keymap is loaded
- THEN every command MUST keep its shipped chord, exactly as with an explicitly empty document

### Requirement: Override Resolution Is Keyed By Command Id

An override MUST apply to the command whose id it names, never to a chord directly. A command with
no matching override MUST keep its declared chord. An override naming a command id that no longer
exists MUST be ignored during resolution and MUST NOT be deleted on read.

#### Scenario: An overridden command answers to its new chord
- GIVEN a command has a stored override
- WHEN a chord is resolved
- THEN the command MUST match on the overridden chord, not its declared chord

#### Scenario: A command with no override keeps its declared chord
- GIVEN a command has no stored override
- WHEN a chord is resolved
- THEN the command MUST match only on its declared chord

#### Scenario: An orphaned override never resurrects a removed command and survives a read
- GIVEN a stored override names a command id absent from the registry
- WHEN the keymap is loaded and then re-read without a save
- THEN no command MUST be matched for that id
- AND the orphaned override MUST still be present unchanged

### Requirement: Persistence Is One Document Under One Settings Key, Opaque To The Backend

The backend MUST store and return the keymap document as an opaque string, performing no chord or
JSON validation on it. Clearing the stored value MUST restore the shipped defaults.

#### Scenario: A saved keymap survives an application reload
- GIVEN a user has saved a keymap with at least one override
- WHEN the application restarts and reloads the keymap
- THEN the same overrides MUST be in effect

#### Scenario: The backend round-trips an invalid document byte-identical
- GIVEN a document that is neither valid JSON nor a valid chord value
- WHEN it is persisted and then read back
- THEN the returned value MUST be byte-identical to what was persisted

#### Scenario: Clearing the stored document restores shipped defaults
- GIVEN a keymap document is stored
- WHEN the stored value is cleared
- THEN every command MUST resolve to its shipped chord

### Requirement: The Shortcuts Panel Renders The Complete Map First, With Mandatory Loading And Error States

The panel MUST render the complete list of bindings, including scoped ones, as the first block. While
the keymap is loading, the panel MUST show an announced loading state with no real binding row. A
failed load or save MUST render the panel's error state, never a loading or empty state.

#### Scenario: The map is the first block, and includes the scoped binding
- GIVEN the panel has finished loading
- WHEN it renders
- THEN the complete binding map, including the Notification Center's scoped command, MUST be the panel's first visible block

#### Scenario: The loading state announces itself and shows no real row
- GIVEN the keymap has not yet finished loading
- WHEN the panel renders
- THEN it MUST expose an accessible, announced loading region and MUST NOT render any real binding row

#### Scenario: A failed load or save shows the error state
- GIVEN loading or saving the keymap fails
- WHEN the panel renders
- THEN it MUST show its error state, never a loading placeholder or an empty state

### Requirement: Chord Capture Records By Listening And Never Triggers A Shortcut

An armed capture control MUST record the next pressed chord and MUST prevent that same keypress from
being dispatched as a command, including the control's own bound command.

#### Scenario: A captured keypress is recorded as the candidate chord
- GIVEN a capture control is armed
- WHEN the user presses a key combination
- THEN the control MUST record the corresponding chord

#### Scenario: Recording a chord never triggers any shortcut
- GIVEN a capture control is armed
- WHEN the user presses a chord already bound to an existing command, including the help overlay's own chord
- THEN no command MUST run as a result of that keypress

### Requirement: Bind-Time Conflicts Block On Duplicates And Warn On Cross-Scope Shadowing

Saving a rebind that collides with another command in the same scope MUST be refused, naming the
colliding command. Saving a rebind whose chord is already claimed by a command in a different scope
MUST be allowed and MUST produce a non-blocking warning.

#### Scenario: A same-scope duplicate is refused
- GIVEN a candidate rebind would give a command the same chord another command already holds in the same scope
- WHEN the user attempts to save it
- THEN the save MUST be refused and the colliding command MUST be named to the user

#### Scenario: A cross-scope shadow is saved with a warning
- GIVEN a candidate rebind would give a scoped command the same chord a global command already holds
- WHEN the user saves it
- THEN the save MUST succeed, and the user MUST be warned the scoped command takes precedence while its scope is active

### Requirement: Recovery Is Always Reachable By Pointer Alone

The panel MUST offer both a whole-keymap reset to shipped defaults and a per-binding revert, and both
MUST be operable using pointer input only, with no keyboard chord required.

#### Scenario: Reset-to-defaults restores every shipped chord using only pointer input
- GIVEN the user has one or more overrides
- WHEN the user activates reset-to-defaults with a pointer, using no keyboard chord
- THEN every command MUST resolve to its shipped chord again

#### Scenario: Per-binding revert restores one command's shipped chord using only pointer input
- GIVEN one command has an override
- WHEN the user activates that binding's revert control with a pointer, using no keyboard chord
- THEN that command MUST resolve to its shipped chord, and other overrides MUST remain unchanged
