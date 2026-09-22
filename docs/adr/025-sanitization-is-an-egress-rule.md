# ADR-025: Sanitization is an egress rule, not a display rule

- **Status**: Accepted, implemented
- **Date**: 2026-09-19
- **Supersedes**: nothing. Scopes a requirement recorded in `openspec/specs/observability/spec.md`
  ("Sanitization and Privacy Are Default-Deny"), which stays as historical evidence and is not amended.
- **Related**: `internal/observability/requestcapture/telemetry.go` (the credential-header denylist),
  `internal/mcp/requestcapture/reader.go` (`mapGetResult`, the egress scrub),
  `internal/desktop/app_backup.go` (the curated bundle that excludes observability tables),
  `docs/ubiquitous-language.md` (the three-way vocabulary this ADR depends on),
  `openspec/changes/mobile-log-ingestion/proposal.md` §"Recorded defects" (where the drift was named)

## Context

A default-deny sanitization rule was written for the whole system. In practice it is
unenforceable at one of the two boundaries it was applied to, and the code violates it
there — which is recorded as drift rather than fixed, because fixing it as written would
mean deleting data the owner needs.

The two boundaries are not alike:

| Boundary | Who can read the data | Confidentiality dimension |
| --- | --- | --- |
| **Egress** — an MCP tool response, an exported bundle | An agent context that may be remote; a file that travels | **Real.** A credential or a raw body can leave the machine |
| **Display** — Activity, in a local single-user app | The owner of the database, on their own machine | **None.** The data is already theirs |

Where sanitization *is* load-bearing today: `mapGetResult` scrubs a captured request before
it reaches an MCP tool. Where it is not: the Activity screen, which the same rule also
covered by being written without a boundary.

What the wrongly-scoped rule cost, measured 2026-09-19:

- `device_sync_diagnostics` held **212 rows across 6 devices with zero readable paths**. The
  only `SELECT` in the package is the retention prune.
- The identical facts were reachable only as raw JSON inside a captured request body — 332
  such captures, none of them attributed to a device.
- The counter this table exists to report climbed from 11 to 20 consecutive unclosed cycles
  with no screen in the application showing it.

The drift is self-reinforcing rather than accidental: `internal/observability/requestcapture/telemetry.go`
stores bodies verbatim and redacts only four credential header names by value denylist, while
`SanitizerConfig.AllowedHeaders` compiles and is dead metadata. A rule the code cannot satisfy
does not produce compliance; it produces a rule everyone learns to ignore, and it makes the
*absence* of data look like a decision instead of a defect.

Confidentiality at rest is also not what carries the risk here. The backup export is a curated
bundle of domain tables (`anime_snapshots`, `seasons`, `season_animes`, `watched_episodes`,
`keyboard_keymap`), so observability tables do not leave through it.

## Decision

1. **Sanitization applies at egress boundaries only**: anything leaving the machine, or entering
   a context the owner does not control — MCP tool responses, exported artifacts, any future
   network surface.
2. **The display boundary does not sanitize.** Activity shows the owner their own data. This is
   the boundary the rule was previously applied to, and applying it there protected nobody.
3. **Raw storage at rest is permitted.** The default-deny clause is read as scoped to egress.
4. **The credential-header denylist stays.** It is cheap hygiene, not a confidentiality control,
   and it must never be cited as one. Its comment is accurate — it says the credential must not be
   *persisted* — which is a persistence statement, not a display one.
5. **An absence in the UI is justified by signal, never by secrecy.** Noise, no actionable answer,
   or a partial view that would mislead are reasons. "It might be sensitive" is not, in a local
   single-user application.
6. **Parity between the two read surfaces is capability-level.** The MCP and Activity must expose
   the same capabilities with *different projections*: identical output is explicitly wrong, because
   achieving it would require removing the egress scrub that decision 1 keeps.

## Consequences

- The drift recorded in `mobile-log-ingestion` is **resolved by scoping, not by deleting bytes**.
  No requirement is violated once the requirement no longer claims the display boundary.
- A surface that withholds stored data must cite a signal reason. Reviewers can now ask for it, and
  "privacy" is not an acceptable answer at the display boundary.
- Observability data becomes eligible for backup bundles, so any bundle that starts including it
  must apply the egress rule at export time — the rule moved, it did not disappear.
- The rule needs a machine owner (per the maintenance principles): the capability catalog and its
  fitness function assert which capabilities each adapter exposes. Absence without a registered
  mechanical reason is a build failure, so hiding data cannot pass silently again.
- This ADR names a boundary rather than removing a rule, which is the same move ADR-007 makes for
  the legacy Spanish fields: the exception is written down and locally scoped, not left implicit.
