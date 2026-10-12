# Episode Duration Notice — Technical Design

**Status:** proposal, not implemented. No production code, schema, migration, UI or notification
change exists. The executable prototype under `tools/episode-triage-poc/` is reference evidence
for the identity component only.

**Supersedes parts of:** [`episode-identity-triage.md`](episode-identity-triage.md) — its
duration reference model (NOMINAL-else-MEDIAN with `k`, `rho`, `delta`) is replaced by a fixed
constant. See [§5](#5-duration-rule).

**Viewable diagrams:** [`episode-duration-notice.html`](episode-duration-notice.html) — component diagram per
entry path, plus the work-unit (ODD) dependency diagram.

**Task tracking:** `odd/tasks/episode-duration-notice.md`.

**Scope, decisions and evidence:** [`episode-duration-notice-scope.md`](episode-duration-notice-scope.md)
— why ODD 3 splits into 3.1 (downloads) and 3.2 (Today), which unit delivers each piece, the
measurements behind the rejected options, and the drift record. Read it before planning a later unit.

## 1. Problem

Anime episodes are downloaded automatically. Occasionally one episode is exceptionally long — a
~40-minute finale among ordinary ~24-minute episodes, or a ~90-minute premiere such as Oshi no
Ko. That goes unnoticed and disrupts planning. Bridge should tell the user, and should do so
just in time when the episode is about to be watched.

Deciding which file is the next episode is a **precondition of one path**, not the feature.

## 2. Two entry paths

**Path A — a download completes.** The only question is whether the downloaded file runs long.
The episode number is irrelevant: the download pipeline already works and is not changed; this
path only adds a validation step after the file lands. Identity is not needed and the folder is
not enumerated, because the download event already names the file.

> **Known drift, recorded 2026-10-12 — the last clause is false.**
> `DownloadEpisodeDownloadedEvent` (`internal/events/event.go:179`) carries `RunID`, `AnimeID`,
> `Episode` and `CorrelationID` only: no path, no basename. The pipeline confirms the landing by
> a filesystem **count** poll (`episodeEnqueueResult.baseline` -> `observed`,
> `internal/download/service_pipeline.go:259`), and that struct's own comment forbids `observed`
> entering any branch, verdict **or event payload**. The file name does exist inside the flow —
> JDownloader reports it (`DownloadLink.Name *string`), Bridge reads it at `rename.go:57`, and
> `newestFinishedLink` (`rename.go:89`) is already documented as "the episode that just landed" —
> but it never leaves the rename step, which runs only when the rename setting is on. **Path A's
> file acquisition is therefore an open scope decision for ODD 3, not an inherited fact.**

**Path B — the user opens Today.** Here it matters whether the episode about to be watched runs
long, so both pieces are needed: identity first, to know which file is the next pending episode,
then duration for that file.

## 3. Components

```
  Sources                    Coordination            Observation            Engine                       Surfaces
  ───────                    ────────────            ───────────            ──────                       ────────
  Descarga completada ─────► Coordinador A ────────► Sonda de duración ───► Hallazgo de duración ─────► Aviso
                                                                           (contra la constante)
  Se abre Today ─────────►   Coordinador B ────────► Observador de carpeta ─► Identidad ─┐
  SQLite anime_snapshots ──► (progreso, carpeta)                │                          │
        (progreso·carpeta·tipo)                                 └────► Sonda ─► Hallazgo ──┴─► Marca en Today
```

| Component | Responsibility | Exists today |
|---|---|---|
| Media inventory (`MediaInventory`) | Capture the media files of one folder with their Windows creation and modification times, and prepare them in the shape the identity algorithm consumes. Read-only: it lists and filters video files, reports an absent or unreadable folder instead of zeros, and classifies nothing | No. `internal/download/filesystem/counter.go` counts numbers only, ignores timestamps and returns `0` on error, so it cannot be reused |
| Media duration probe | Obtain the real runtime of one file | No |
| Identity | Decide which file is the next pending episode, or abstain with a reason | **Prototyped and proven** |
| Duration finding | Compare one file's runtime against the constant and emit LONG / NOT_LONG / UNAVAILABLE with evidence | No |
| Coordinator A | React to a completed download, validate that file, notify | No |
| Coordinator B | On Today open, resolve the next pending episode and validate it live | No |
| Surfaces | The informational notice and the Today mark | Partially: `internal/notification` exists |

The engine is pure: no I/O, no clock, no randomness, and **no external lookup of any kind**.
Nothing is derived from the folder other than each file's own runtime.

## 4. Integration seams

- Pure decision code inside the anime bounded context, next to `internal/anime/domain/`.
- Observation enters through a port; the adapter is read-only and reports diagnostics rather
  than defaulting a missing reading.
- The application layer reads progress and the folder path through the existing store gateway
  (`internal/anime/store`), which already exposes a `folder` field per anime
  (`internal/anime/episode_service.go`, `EpisodeScheduleItem.FolderPath`).
- Delivery uses the existing notification port (`internal/notification`) and a Wails binding in
  `internal/desktop`, the only package allowed to import the runtime.
- Progress is `NroCapVisto`; the cursor convention's expectation enters as an explicitly labelled
  hypothesis, never as authority, so a wrong convention can be detected instead of trusted.
- `ffprobe` is not wired today. Duration availability is therefore a real risk, not an
  assumption.

## 5. Duration rule

The threshold is a **constant**, not a computation:

| Range | Meaning | Behaviour |
|---|---|---|
| under 20 min | short | no notice |
| **20–30 min** | normal | no notice |
| over 30 min | long | notice on the applicable path |

No arithmetic mean is computed, no per-folder median is derived, and no catalogue runtime is
looked up. The band is simply a constant, centred on the ordinary ~24-minute episode. This
supersedes the earlier reference model and its uncalibrated `rho = 1.5` with `delta = 600 s`,
which would only have alerted from roughly 36 minutes.

## 6. Path rules

**Path A.** On a completed download, take the file from the event, read its runtime, compare it
against the constant, and if it is long, send one informational notification. The notification
itself is the only record of that download and is intentionally transient, which is exactly why
Path B exists. If the application was not running when the file landed, that notice is lost;
Path B still covers the episode later.

**Path B.** Opening Today computes on the fly: resolve which file is the next pending episode
using progress and the folder, read that file's runtime, compare it against the constant and
show the result. Nothing is stored, so the mark always reflects the current folder. If identity
is not established with confidence, fail closed and show nothing rather than name a wrong
episode.

**No persistence.** There is no findings store and nothing to archive. Because Path B recomputes
on every open, runtimes should be cached in memory for the session.

**Applies to TV anime only.** Movies, OVAs and specials stay silent, decided from the anime type
Bridge already stores. ONA and shorts stay excluded until a per-format rule exists.

**Wording.** The notice is informational, never a warning or an error.

## 7. Identity decision: production contract

This contract exists because a previous attempt ported the prototype wholesale — its input snapshot
format, its tolerant JSON decoding and its per-file evidence report — and inherited a mutation surface
of 671 mutants and 340 survivors. Almost all of those mutants lived in machinery the application never
consumes. The lesson is a rule: **no field and no branch enters production without a named consumer.**
The prototype keeps its report layer; that layer exists to show evidence to a human reviewer.

### What the application actually has

- Folder observations: basename, creation time, modification time, explicit episode tags, a read error,
  and the changed-between-stats flag. Creation and modification times are decimal nanoseconds, empty
  meaning unavailable and never zero-filled.
- Stored context: watched progress, and optionally the expected next episode from the existing cursor
  convention, which enters as a labelled hypothesis and never as authority.

Two of those observations carry decisions and are named here so nobody removes them as unused: the
**explicit tags** feed the tag-conflict guard, and the **changed-between-stats flag** feeds the
reliability guard that keeps an unstable file out of every claim. A third, **file size**, is deliberately
NOT part of the input: this algorithm has no size consumer, and a field nothing reads is surface nobody
maintains.

There is no snapshot envelope, no declared folder convention and no tolerant-decoding layer: the
application owns its data shapes, so the decision function takes typed Go values.

### What the application actually needs back

```
Result
  Next         *Selection   // episode plus basename, or nil when the decision abstains
  Reason       string       // one short human sentence, shown in the interface
  Basis        Basis        // direct-number | elimination | chronology | none
  Watched      int          // already-watched files considered
  Pending      int          // pending files considered
  Diagnostics  []Diagnostic // bounded, typed facts worth keeping
```

`Diagnostic` carries only what a surface or an operator acts on: a creation-date inversion kept as a
fact, an unusable context token, a typed ambiguity that forced an abstention, a duplicate claimant
excluded by reconciliation. It is a typed set, not free prose, so a test can assert it without freezing
sentences.

`Diagnostics` is an unordered FACT SET and its element order is not part of the contract. Ordering
depends on an internal basename sort, and a reordering that preserves every fact is not a behaviour
change; permutation stability is promised for the decision and for the set of facts, not for the slice
sequence. If an ordered diagnostic list is ever needed, that is a new contract for a consumer that
wants it, not an obligation this one carries.

### Rules that stay unchanged

The semantics validated by the prototype are preserved exactly, because they are the part worth
porting: watched-first filtering by integer progress, clear numbers beating a creation-date inversion
with the inversion kept as a diagnostic, conditional single-pending elimination under a complete
watched prefix, relative pending chronology, typed ambiguity guards, global one-to-one reconciliation,
immutable input, permutation stability and exact big-integer timestamps. Parity is asserted on the
**decision** — the selected file and episode, or the abstention — not on an evidence report.

### Go-specific guards (no prototype equivalent)

The guards below exist because the prototype's domain is narrower than Go's type surface. They are
guards, not rules, and the tests that pin them say so. The last entry records a rejection that was
removed, kept here so nobody reintroduces it.

- **The usable requested next must be at most 2^53 - 1.** The prototype imposes no bound, so this is a
  Go-specific guard. It bounds the NEXT the decision aims at, deliberately not the context value and not
  the end of the assignment range, because only a collision at the requested next can change the
  decision: the prototype derives candidates in float64, where 2^53 + 1 rounds back onto 2^53, so with
  next == 2^53 the first two claimants collide and reconciliation suspends both into an abstention that
  exact integer arithmetic never produces. Collisions later in a long pending list suspend files that
  were never going to be selected, so they need no guard. Integer progress is admitted up to 2^53 - 2 so
  that progress + 1 stays inside the bound; a context whose derived next would leave it yields no usable
  next and the decision abstains, which matches the prototype's abstention while naming a different
  reason (an unusable context rather than a suspended collision).
- **Empty or malformed decimal timestamps fail closed as unavailable.** The prototype's capture only
  ever produces decimal strings or null, so malformed input has no encoding there; feeding one even
  throws in its rank interval pass. Failing closed is the honest Go answer. Note that the timestamp
  parser itself does NOT tell an empty reading from a corrupt one: both return an unavailable value, and
  a caller that needs the difference reads it from the entry's read error, which is what represents a
  file that could not be read at all.
- **Negative timestamps compare as exact signed big integers**, exactly as the prototype does. An
  earlier revision rejected them, which changed a decision for representable values; that rejection was
  removed.

### Coverage tiers for this unit

- **CORE (100%)**: the decision logic and the validation it depends on — filename parsing, watched
  partitioning, resolution, reconciliation, and every guard whose failure changes or crashes the
  decision. Every mutation survivor here is killed or proven equivalent.
- **IMPORTANT (80%)**: the human-facing `Reason` and the `Diagnostic` set, asserted at the level of
  structure and content kind, not by pinning prose.
- **INFRASTRUCTURE (0%)**: the Go type definitions and the exported constants. No tests, no mutation
  chasing, and out of the mutation scope.

## 8. Open decisions

- Notice wording and placement on each path.
- Where the Today mark appears in the interface.
- What the feature does when a runtime cannot be read: no finding, no notice, never a guess.
- Whether an ADR is warranted for the fixed-constant threshold and the two-path split.

## 9. Out of scope

Download-cursor migration, changing the download algorithm, file renaming or moving, content or
playback inspection, automatic progress repair, and documentation-as-an-ODD.

## References

- [`episode-identity-triage.md`](episode-identity-triage.md) — formal predecessor proposal; §6
  duration model is superseded by §5 here.
- [`episode-identity-triage-user-flow.md`](episode-identity-triage-user-flow.md) — simple
  user-level flow.
- [`episode-duration-notice.html`](episode-duration-notice.html) — component diagram.
- [`architecture.md`](architecture.md) — hexagonal layout and bounded contexts.
- [`adr/022-myanimelist-metadata-source.md`](adr/022-myanimelist-metadata-source.md) — the
  catalogue source that this feature deliberately does **not** query.
- [`notification-cta-policy.md`](notification-cta-policy.md) — notice policy.
- `odd/tasks/episode-duration-notice.md` — work-unit tracking.
