# Delta for Sync Conflicts

Change: `2026-07-14-sdd-49-anime-repeat-restore-edit`
Capability: `sync-conflicts`
Source: `openspec/specs/sync-conflicts/detection.md`

## MODIFIED Requirements

### Requirement: Backward-compat safe path (unverifiable base on an existing record)

When `base == null` or is absent for an existing anime, a legacy/mobile write
MUST temporarily use the staged observe-only compatibility path. If the desired
value differs, the bridge MUST apply it last-write-wins, advance `modified_at`,
and return the existing successful mobile/HTTP response. It MUST NOT insert a
conflict or notify as though OCC had been enforced; observability MAY report the
would-be divergence. If the desired value already equals current state, the
bridge MUST retain the no-op guard and MUST NOT write, stamp, record, or notify.

This exception MUST apply only when the base is absent. Bridge Repeat/Restore
MUST always send an explicit base. When that base is stale and the desired state
differs, the bridge MUST NOT apply it, MUST record the conflict, MUST preserve
both states, and MUST return the current token and conflict outcome.

(Previously: A base-less write for an existing record took the enforced safe
path: it did not apply a differing value, recorded a conflict, and notified,
unless the no-op guard applied.)

#### Scenario: Old client without base on an existing record takes the safe path

- **GIVEN** an anime with current `modified_at = T1` and `NroCapVisto = 12`
- **WHEN** an old-client mobile patch arrives with `base` absent and `NroCapVisto = 13`
- **THEN** the bridge applies `NroCapVisto = 13` and advances `modified_at`
- **AND** it returns the existing successful response without a conflict row
- **AND** no conflict notification is sent

#### Scenario: Old client without base sending an already-current value is a no-op

- **GIVEN** an anime with current `modified_at = T1` and `NroCapVisto = 12`
- **WHEN** an old-client mobile patch arrives with `base` absent and `NroCapVisto = 12`
- **THEN** the bridge treats the write as a successful no-op
- **AND** no conflict row is recorded

#### Scenario: Explicit stale Bridge action remains enforced

- **GIVEN** AnimeDetail sends Repeat or Restore with stale base T1 while current is T2
- **WHEN** the desired state differs from the current state
- **THEN** the bridge leaves the canonical anime and `modified_at = T2` unchanged
- **AND** it records both states and returns `conflict`, T2, and the conflict identity
