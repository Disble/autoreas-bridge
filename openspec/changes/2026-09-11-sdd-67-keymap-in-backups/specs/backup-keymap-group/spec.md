# Backup Keymap Group Specification

## Purpose

Defines the behavior contract for the fourth backup bundle group, `keyboard_keymap`: the single
`app_settings["keyboard.keymap"]` value promoted out of the machine-local exclusion that
`backup-import-export` still enforces for every other `app_settings` key. Covers export, the
present-but-empty and absent-group semantics on import, forward/backward compatibility with builds
that do not know this group, the post-import refresh that makes a restored keymap effective
immediately, and the guard proving each shipped importer changes only what it declares.

## Requirements

### Requirement: Export Carries The Keymap Document Verbatim

The system MUST export the `keyboard_keymap` group carrying the exact value of
`app_settings["keyboard.keymap"]` as a single JSONL record when that value is non-empty. When the
value is empty — never rebound, or already reset to defaults — the system MUST still include
`keyboard_keymap` in `contexts[]`, with `recordCount` equal to `0` and zero JSONL lines.

#### Scenario: A persisted keymap exports as one verbatim record

- GIVEN a bridge DB with `app_settings["keyboard.keymap"]` set to a non-empty document
- WHEN an export runs
- THEN `manifest.json`'s `contexts[]` MUST contain an entry named `keyboard_keymap` with
  `recordCount` equal to `1`
- AND the single line in `data/keyboard_keymap.jsonl` MUST be a `{"document": "<value>"}` record
  whose `document` field decodes to the persisted document byte for byte, with no normalization,
  re-encoding, or reformatting of the document itself

An earlier draft of this scenario said the line "MUST equal the persisted document, byte for byte".
That contradicted design D1, which wraps the document in a one-field record, and it was not a
harmless simplification: a raw line cannot carry an arbitrary opaque document at all — the round-trip
already pinned by `internal/settings/keymap_test.go` persists `{not json: alt++`, which is not a
valid JSONL line. The envelope is what makes "verbatim" achievable; the requirement is that the
*document* survive unchanged, not that the *line* be the document.

#### Scenario: An unset keymap exports as a present, empty group

- GIVEN a bridge DB where `app_settings["keyboard.keymap"]` has never been set
- WHEN an export runs
- THEN `manifest.json`'s `contexts[]` MUST contain an entry named `keyboard_keymap` with
  `recordCount` equal to `0`
- AND `data/keyboard_keymap.jsonl` MUST contain zero lines

### Requirement: Import Writes Only Its Own Key

The system MUST import a carried `keyboard_keymap` group by writing only
`app_settings["keyboard.keymap"]`. It MUST NOT modify, delete, or overwrite any other `app_settings`
key, and MUST NOT modify any table outside `app_settings`.

#### Scenario: Importing a keymap-only bundle leaves every other app_settings key untouched

- GIVEN a bridge DB whose `app_settings` table holds a distinct value under every key the build
  writes, `keyboard.keymap` among them
- WHEN a bundle carrying only the `keyboard_keymap` group is imported
- THEN every `app_settings` row whose key is not `keyboard.keymap` MUST be byte-identical before and
  after the import, compared without naming the keys
- AND no table outside `app_settings` MUST be modified by this group's import

The comparison MUST NOT enumerate the other keys. An earlier draft of this scenario named four of
them, and there are more than four: `internal/settings` declares five keys, and `internal/desktop`
owns a sixth, `observability.events.persist_debug`, at `app_runtime_services.go:101`. A scenario
that lists the keys it checks silently stops covering the next one somebody adds, which is the
failure this wording exists to avoid — the same shape as a gate that passes because the new surface
is absent from it.

### Requirement: A Present-But-Empty Group Resets The Keymap To Defaults

The system MUST treat a carried `keyboard_keymap` group with zero records as an explicit instruction
to reset `app_settings["keyboard.keymap"]` to the empty document, restoring the shipped default
chords for every command.

#### Scenario: An empty carried group resets a rebound keymap

- GIVEN a bridge DB with a non-empty, rebound `app_settings["keyboard.keymap"]`
- WHEN a bundle whose `keyboard_keymap` group carries zero records is imported
- THEN `app_settings["keyboard.keymap"]` MUST equal the empty string after the import
- AND every command MUST resolve to its shipped default chord

### Requirement: An Absent Group Leaves The Keymap Untouched

The system MUST leave `app_settings["keyboard.keymap"]` completely unchanged when a bundle's
manifest does not name a `keyboard_keymap` group at all — the same "omission is not deletion"
guarantee already defined for every other group.

#### Scenario: A bundle with no keyboard_keymap group leaves the keymap unchanged

- GIVEN a bridge DB with a non-empty, rebound `app_settings["keyboard.keymap"]`
- WHEN a bundle whose manifest names no `keyboard_keymap` group is imported
- THEN `app_settings["keyboard.keymap"]` MUST retain its exact pre-import value
- AND no `keyboard_keymap`-related error or warning MUST be reported

### Requirement: An Unknown Group Is Ignored With A Warning

The system MUST tolerate a `keyboard_keymap` group unknown to the running build — including a build
older than this capability reading a bundle that carries it — by ignoring the group's records and
reporting it as a warning, without failing the import and without any `formatVersion` change.

#### Scenario: An older build ignores a bundle's keyboard_keymap group

- GIVEN an import running on a build that does not know the `keyboard_keymap` group
- WHEN it previews or applies a bundle whose manifest names a `keyboard_keymap` group
- THEN the outcome MUST list `keyboard_keymap` among its unknown/ignored groups
- AND no other group's import outcome MUST be affected
- AND `formatVersion` MUST remain unchanged by the presence of this group

### Requirement: A Restored Keymap Reaches The Running Dispatcher Without A Restart

The system MUST make a keymap document restored by an import immediately effective for chord
resolution — the dispatcher, the shortcuts help overlay, and the Settings → Shortcuts panel MUST all
resolve chords against the newly restored document — without requiring the user to restart or reload
the application.

#### Scenario: A rebound-then-restored chord resolves to its new command right after import

- GIVEN a chord bound to command A in the running session
- AND a bundle whose `keyboard_keymap` group rebinds that same chord to command B
- WHEN the bundle is imported and the import succeeds
- THEN pressing that chord immediately afterward MUST run command B, not command A
- AND this MUST hold without reloading or restarting the application

### Requirement: An Importer Modifies Only Its Declared Footprint

Every entry in the build's import group registry MUST declare the exact set of rows or keys it is
permitted to modify, and its import behavior MUST NOT modify any row or key outside that declared
footprint.

This requirement proves that each shipped group's declared-and-respected footprint holds; it does
not prove an arbitrary future importer is safe, because the import group contract carries no
parameter through which a scope could be enforced structurally.

#### Scenario: Importing one group leaves every other group's data byte-identical

- GIVEN a bridge DB seeded with data in every table and `app_settings` key touched by any shipped
  import group
- WHEN a bundle carrying exactly one group is imported
- THEN every row and key outside that group's declared footprint MUST be byte-identical before and
  after the import

#### Scenario: Every shipped import group declares a footprint the guard enforces

- GIVEN the build's registered import groups
- WHEN the footprint guard inspects that registry
- THEN every entry MUST have a declared footprint
- AND an entry with no declared footprint MUST fail the guard
