# Delta for Legacy Gateway

**Spec-level drift recorded (per CLAUDE.md rule 2 — code/design wins over
the proposal's mental model):** the proposal frames `internal/anime/legacy/`
(~28 files) as a byte-compat adapter deletable wholesale. `design.md`
(ADR-55-3) verified against the code that this is only partially true:
`gateway.go`, `gateway_write_helpers.go`, and `gateway_contracts.go`
implement the decode → merge → Stage → Finalize orchestration that is
Bridge's **active SQLite persistence engine** for `anime_snapshots`, not
dead Legacy interop. What this delta retires is the **Legacy channel
identity** of this capability — the guarantee that this gateway is the
exclusive, byte-compat door to an external Legacy app's `animes.dat` file.
What is **retained and relocated** (ADR-55-3: `wire.go`,
`wire_validation.go`, `mapper.go`, `projection.go`, `create.go`,
`gateway.go`, `gateway_write_helpers.go`, `gateway_contracts.go`,
`outbox.go`) is the decode/merge/stage/finalize codec and orchestration
itself, moved to a native, non-"legacy"-named package, with only the
`Append`/`FilePath` file-channel port and its file-append branch deleted.
Governance of the retained orchestration passes to the
`bridge-native-persistence` capability going forward; this capability is
retired as a named contract, not as executable code.

## REMOVED Requirements

### Requirement: Exclusive Legacy I/O
**Reason**: There is no external Legacy app or `animes.dat` file left to
have exclusive I/O ownership over; the file-channel port (`Append`/
`FilePath`) is deleted, so the guarantee no longer has a Legacy target.
**Migration**: Per `design.md` ADR-55-3, the underlying decode/merge/Stage/
Finalize orchestration (`gateway.go`, `gateway_write_helpers.go`,
`gateway_contracts.go`) is **retained and relocated** to a native package —
not deleted. Domain writes (Create, Repeat, Restore, editor saves, schedule
bulk applies) continue to flow through this retained orchestration into
`anime_snapshots` (SQLite); no separate SQLite repository is newly built to
replace it.

### Requirement: Lossless three-layer mapping
**Reason**: The requirement's original rationale — preserving fields across
an `animes.dat` file round-trip for an external Legacy consumer — no longer
applies once the file channel is deleted.
**Migration**: The codec implementing this mapping (`wire.go`,
`wire_validation.go`, `mapper.go`, `projection.go`, `create.go`) is
**retained and relocated** (ADR-55-3), unchanged in behavior. It now serves
as Bridge's own `anime_snapshots.snapshot_json` storage codec: nullable and
unknown fields continue to be preserved losslessly across SQLite reads and
writes, but for Bridge's internal persistence, not Legacy file
compatibility. Future evolution of this codec is governed by the
`bridge-native-persistence` capability, not this retired one.

### Requirement: Canonical outbound representation
**Reason**: "Outbound" meant the canonical shape written to `animes.dat`;
that append path is deleted, so there is no outbound Legacy file
representation left to canonicalize.
**Migration**: The same structural invariants (required create fields, the
`portada` object shape, and the `_id`/`modified_at`/`repetir`/`primeravez`
ownership exclusions) continue to be enforced by the retained/relocated
codec against the SQLite-stored `snapshot_json` blob — the code and its
validation rules are unchanged; only the file-append destination is gone.

### Requirement: Honest read and write failures
**Reason**: The failure modes named (malformed inbound data, Legacy read
failure, append failure) were framed around `animes.dat` I/O; the file-read
and file-append failure modes no longer exist because that I/O is deleted.
**Migration**: Malformed-data and validation-failure handling in the
retained codec (decode/merge) continues to apply to SQLite reads/writes.
SQLite read/write/persistence failures continue to surface as explicit
errors via the retained Stage/Finalize orchestration — unchanged code, not
newly introduced.

### Requirement: Gateway is independent of metadata sources
**Reason**: This requirement is retired as a named contract of the
"Legacy Gateway" capability along with the rest of this spec; the
underlying independence from scraper/cover-source adapters is not a
behavior this change alters.
**Migration**: The retained/relocated codec and orchestration continue to
accept already-enriched Create input and continue not to call scraper or
cover-source adapters — unchanged behavior, now governed by the
`bridge-native-persistence` capability rather than this retired one.
