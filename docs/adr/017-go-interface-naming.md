# ADR-017: Single-method Go interfaces take their method's agent noun

- **Status**: Accepted
- **Date**: 2026-09-02
- **Supersedes**: nothing
- **Related**: SonarQube rule `godre:S8196`, [Effective Go — Interface
  names](https://go.dev/doc/effective_go#interface-names)

## Context

SonarQube reported thirteen `godre:S8196` findings — "single-method interface
names should follow Go naming conventions". The question that took real work was
not whether the rule is right in general, but whether this repository's
ports-and-adapters vocabulary already answered the same question differently.

It does not. The two conventions never overlap, and this ADR records why, so the
next person does not have to re-derive it.

### What the codebase already does

Measured across all 93 production interfaces:

| Suffix | All interfaces | Single-method only |
|---|---|---|
| `-er` / `-or` (Go idiom) | 52 | **37** |
| `Store` | 10 | 2 |
| `Service` | 9 | 2 |
| `Registry` | 3 | 0 |
| `Probe` | 1 | 1 |

**84% of single-method interfaces already used the idiom** before this change —
`Deliverer`, `Notifier`, `Flattener`, `Renamer`, `Fetcher`, `FileReader`,
`BatchCreator`, `EventPublisher`, `ConflictWriter`. Nobody was asked to do that.
The role suffixes cluster on multi-method interfaces, where the idiom does not
apply.

### Why the split is principled and not arbitrary

With one method, the interface **is** that method, so the name is derivable from
behaviour: read `Deliverer` and you know the whole contract without opening the
file. With several methods there is no privileged one to derive from —
`SyncTriggerService` has `TriggerReconcile`, `ListChangesSince`,
`ListChangesAfterID`, `AcknowledgeDevice` and `LastChangedAt`, and no agent noun
covers that set without lying about the rest. The name then has to do a
different job: state the **role**.

### What the architecture vocabulary prescribes

The code names its own patterns in prose — `port`, `gateway`, `seam`, `adapter`,
`composition root`, `anti-corruption boundary`. That is Hexagonal (Cockburn)
with DDD (Evans) on top, and it does prescribe nouns:

| Name | Source | Here |
|---|---|---|
| `Repository` | DDD — persistence port for an aggregate | `season.Repository` |
| `Gateway` | PoEAA — access point to an external system | `anime/store.Gateway`, `season.AnimeGateway` |

Both are multi-method **by what they are**: a repository has find/save/delete, a
gateway has several operations against the far side. Neither canon says anything
about a one-method port, which is precisely the gap Go's idiom fills.

The repository had already resolved this correctly, in the file that defines the
storage gateway:

```go
// internal/anime/store/gateway_contracts.go
type WriteBaseStore interface { Stage(...); Finalize(...); Abort(...); /* 10 */ }
type ConflictWriter interface { InsertConflict(...) }                  // 1
```

Same file, same layer, same author. Multi-method takes the role name;
single-method takes the idiom.

## Decision

1. A **single-method** interface is named for its method as an agent noun:
   `Reader`, `Writer`, `Inserter`, `Patcher`.
2. A **multi-method** interface is named for its role: `Repository`, `Gateway`,
   `Store`, `Service`, `Registry`.
3. Package qualification counts against stutter. Inside `eventlog`, the port is
   `Inserter` so callers read `eventlog.Inserter`, not `eventlog.EventInserter`.
4. The **concrete adapter keeps its own name.** `sync.StatusService` is a
   service; it implements the `contracts.StatusReader` port. Adapters are named
   for what they are, ports for what they do.

### The one exception

When the single method is an **accessor rather than an action**, the agent noun
names the wrong actor and the rule does not apply. Both current cases carry a
`// NOSONAR godre:S8196` with the reason at the declaration:

- `events.Event` — `Name() string`. "Namer" describes the accessor, not the
  domain concept the whole bus is built on.
- `tray.menuItem` — `Clicked() <-chan struct{}` hands back a channel. The item
  does not click; it is clicked.

The test is whether the method is something the interface *does*. `PatchAnime`,
`GetStatus`, `InsertEvent`, `UpsertCapture` and `AvailableEpisodes` all are,
which is why none of them qualified for this exception.

## Consequences

Renamed, 44 references:

| Before | After | Method |
|---|---|---|
| `eventlog.Store` | `eventlog.Inserter` | `InsertEvent` |
| `requestcapture.Store` | `requestcapture.Upserter` | `UpsertCapture` |
| `contracts.AnimeWriteService` | `contracts.AnimePatcher` | `PatchAnime` |
| `contracts.StatusService` | `contracts.StatusReader` | `GetStatus` |
| `season.AvailabilityProbe` | `season.AvailabilityReader` | `AvailableEpisodes` |

Renaming does not change type identity in Go, so every implementation still
satisfies its port. `go build`, `go vet` and all 44 packages pass.

Nothing bans `Store` or `Service`: they remain correct on the multi-method
interfaces that carry them, including `device.Store` (8 methods) and
`store.WriteBaseStore` (10).

## Rejected: consistency within a naming family

The argument that `StatusService` should stay because it sits beside
`SyncTriggerService` and `DeviceAdminService` was considered and rejected as
circular. Those siblings are called `Service` because with five and two methods
they **could not** be named after a method. `StatusService` had one method, so
its name was derivable and someone chose not to derive it. A file holding both
`StatusReader` and `SyncTriggerService` is not inconsistent — it is exactly what
this ADR prescribes, because the two are different shapes.

Note also that `internal/season/ports.go` already held `NameSearcher` and
`AvailabilityProbe` side by side: two ports, the same decision, two different
conventions. That was drift, not a family.
