# Delta for Anime Legacy Raw Model

**Spec-level drift recorded (per CLAUDE.md rule 2 — code/design wins over
the proposal's mental model):** the proposal and this delta's original
draft framed `LegacyAnimeRaw` and the `internal/anime/legacy/` model as a
byte-compat adapter to delete in full. `design.md` (ADR-55-3) verified
against the code that `anime_snapshots.snapshot_json` stores each anime as
Legacy-shaped NeDB canonical JSON (Spanish keys: `nrocapvisto`, `estado`,
`activo`, `dia`, `orden`, …), and the codec implementing this model
(`wire.go`, `wire_validation.go`, `mapper.go`, `projection.go`,
`create.go`) is Bridge's **active internal storage codec** for that blob,
not dead Legacy interop. What this delta retires is the **byte-compat
GUARANTEE to an external Legacy app** — no external consumer of this format
remains, and Bridge makes no promise to stay compatible with one. What is
**retained** is the `snapshot_json` wire representation itself, verbatim
with its Spanish JSON keys, as Bridge's own internal storage codec, until a
future change migrates the stored shape (out of scope here; the
`episode-vocabulary` and `bridge-native-persistence` deltas require
additive-only migrations for this change). Only the real-fixture validation
requirement below is genuinely deleted, since its fixture
(`resources/autoreas-data/animes.dat`) is removed.

## REMOVED Requirements

### Requirement: Legacy `$$date` compatibility
**Reason**: This requirement is retired as a named contract of the
"Anime Legacy Raw Model" capability — its rationale (round-tripping a date
wrapper for an external Legacy consumer) no longer applies once there is no
external consumer.
**Migration**: The `$$date` wrapper handling in the retained/relocated
codec (ADR-55-3) continues to operate unchanged on `snapshot_json` values,
since that field remains stored in Legacy-shaped NeDB JSON. No timestamp
data is reformatted or migrated by this change.

### Requirement: Optional and nullable fields are preserved losslessly
**Reason**: This requirement's framing ("legacy round-trip") is retired
along with the capability's Legacy-facing identity.
**Migration**: The retained codec continues to preserve the distinction
between absent, explicit-null, and concrete values for `snapshot_json`
fields — this is now a Bridge-internal storage-fidelity guarantee, not a
Legacy-interop one. No successor model replaces it; the same code
continues to run.

### Requirement: `activo` is tri-state, not binary tombstone logic
**Reason**: This requirement is retired as a Legacy-interop contract; the
tri-state distinction was originally framed around Legacy's tombstone
semantics.
**Migration**: The retained codec continues to distinguish `activo=true`,
`activo=false`, and omitted `activo` inside `snapshot_json` unchanged.
Bridge's separate SQLite soft-delete columns (outside `snapshot_json`) are
untouched by this removal.

### Requirement: Fractional progress is supported
**Reason**: Retired as a named Legacy-compatibility contract; the
underlying behavior is not being removed from the codebase.
**Migration**: The retained codec continues to accept and preserve
fractional `nrocapvisto` values inside `snapshot_json` unchanged.

### Requirement: Legacy day variants are tolerated
**Reason**: Retired as a named Legacy-compatibility contract; historical
`dia`/`orden` vs. `dias[]` tolerance is a codec detail, not an
external-interop guarantee, once there is no Legacy app to interop with.
**Migration**: The retained codec continues to tolerate both variants when
decoding/encoding `snapshot_json`, unchanged. No stored data is rewritten to
drop either variant by this change.

### Requirement: Round-trip is lossless for supported legacy records
**Reason**: Retired as a Legacy-interop contract; the requirement's
original framing was about round-tripping through an external
`animes.dat` file, which no longer exists.
**Migration**: The retained codec's decode → merge → encode round-trip
continues to be lossless for `snapshot_json`, now verified as an internal
SQLite storage-fidelity property (see the Slice B codec round-trip test in
`design.md`'s Test Strategy) rather than an external Legacy-compatibility
property.

### Requirement: Real fixture compatibility is validated
**Reason**: The real fixture `resources/autoreas-data/animes.dat` and its
dedicated compatibility tests exist solely to validate parsing an external
Legacy file; both are genuinely deleted, since Bridge never reads that file
again.
**Migration**: `resources/autoreas-data/animes.dat` is removed from the
repository along with its compatibility test suite. Per `design.md`, the
retained codec's round-trip fidelity is instead validated against a
**copied, real stored-shape `snapshot_json`** fixture (cloned into
`t.TempDir()`, never mutating the deleted `animes.dat`), so coverage of
real Spanish-key shapes is not lost — it moves from file-fixture validation
to SQLite-blob-fixture validation.
