# ADR-014: Anime creation stores the page; download execution interprets it

- **Status**: Accepted, implemented
- **Date**: 2026-08-25
- **Supersedes**: nothing
- **Implemented by**: `ffa4f14 feat(download): add local readiness workflow`, and
  archived change `openspec/changes/archive/2026-07-22-sdd-57-create-anime/`
- **Related**: `docs/adr/013-notification-center-boundaries.md`

## Context

Anime creation used to consult download machinery: it resolved a source
adapter and treated an unsupported page as a creation failure. That coupled a
catalog write to the current state of a download registry and to the current
state of the internet.

The consequences were all user-visible. A page useful only for consultation
could not be saved. A historical anime pointing at a site that had since
dropped support could not be repeated. And a supported site changing over time
retroactively invalidated rows that were fine when they were written.

## Decision

> **Anime creation stores the page. Download execution interprets its
> capabilities.**

Creation persists the supplied reference and nothing more. It does not resolve
an adapter, list episodes, contact the source site, or report download
compatibility. In the shipped code this is literal: `CreateAnime` validates the
payload and hands `CreateMetadata{}` — empty — to the writer
(`internal/anime/create_service.go:63`). No download package is imported.

Download capability belongs exclusively to the Download bounded context, which
evaluates it locally when the Downloads page opens and evaluates it again
before doing runtime work.

### Responsibilities

| Concern | Owner |
|---|---|
| Store an anime page; repeat an old anime | Anime — persist the reference and stable metadata without consulting adapters |
| Whether a page is required or syntactically acceptable for creation | Anime form/domain validation — independent of adapter support and of the network |
| Source adapter compatibility | Download — `SiteRegistry.Resolve`, at readiness and at runtime |
| List available episodes | Download — only during an explicit or scheduled run |
| Derive an effective destination | Download — explicit folder, else downloads root plus sanitized name |
| Create or use a destination directory | Download/JDownloader/filesystem adapters — absence is a normal execution state |
| Report why a download cannot start | Download — stable reason codes; the frontend maps them to copy |

### The line between a readiness blocker and a runtime outcome

This is the part that erodes silently, so it is stated as a rule rather than
as a list to be extended by intuition.

**A page-open readiness blocker is a fact derivable from local state alone,
and correctable by the user before starting anything.** There are exactly four,
and they are backend-owned stable codes
(`internal/api/contracts/services.go:147-176`): `missing_source`,
`invalid_source`, `unsupported_source`, `destination_unresolved`. They are
returned in that deterministic order, and an item keeps all of them at once so
the UI can explain every local correction in one pass.

**A runtime outcome is a fact that does not exist until a request is made.**
Source-site timeouts and malformed responses, "no new episode", link
extraction failure, hoster fallback exhaustion, JDownloader connectivity, and
filesystem I/O errors are all in this class. They belong in run progress, run
details, and notifications — never in the page-open blocker set.

The line is drawn at *local derivability*, not at severity or likelihood. Put
a network fact on the readiness side and page-open acquires latency, side
effects, rate-limit exposure, and transient false blockers that the user
cannot act on. That is why the evaluator
(`EvaluateAnimeForDownload`, `internal/download/decision.go:79-109`) does only
string parsing, URL parsing, a registry lookup, and path derivation. Both
callers share it — `internal/download/readiness.go:73` at page open and
`internal/download/service_pipeline.go:61` at execution — so the two
evaluations cannot drift apart.

Several properties are deliberately **not** blockers: an inactive anime (that
is scheduler-candidate selection, and Solo Download can target anything), a
Movie or OVA type, a destination directory that does not exist yet, episode
progress, and files on disk. Readiness answers one narrow question — *can the
application begin a download check using local information?* — which is why
the UI says "Ready for download check" and not "will download".

## Consequences

- `SkipReasonUnsupportedTipo` is retained but dead as policy
  (`internal/download/decision.go:45-50`): it exists only so historical
  `download_runs` rows stay readable. `Tipo` survives on the candidate struct
  for the same read-compatibility reason and never blocks readiness.
- Readiness is a snapshot of local state, so it can be stale relative to disk
  or to registry changes. Runtime revalidation, not a fresher page-open check,
  is the answer to that.
- A blocked anime still appears in the catalog with its reasons attached; the
  frontend owns the code-to-copy mapping and must stay in step with the four
  codes above.

## Rejected designs

- **Best-effort metadata enrichment during creation.** Still assigns
  download-source interpretation to creation; turning failures into warnings
  changes the severity while preserving the wrong boundary.
- **Creation warnings for unsupported sources.** An unsupported adapter is not
  anomalous at creation time — the page may be a valid reference, a
  direct-download page, or a historical value.
- **Frontend-only readiness classification.** The slim frontend anime model
  does not carry the source URL, and adapter compatibility is backend-owned;
  duplicating registry rules in TypeScript would drift from execution.
- **Network validation when Downloads opens.** Live availability is a runtime
  fact; page-open network work buys latency, side effects, rate-limit risk,
  and transient false blockers.
- **Activity as a universal blocker.** Activity is a scheduler-selection
  concern; Solo Anime Download can intentionally target any catalog anime.
- **Type-based blocking.** Movie/OVA classification does not determine whether
  a registered adapter can supply downloadable content.
- **Stored folder presence as the destination rule.** A deterministic
  destination is derivable from the global downloads root, and a missing
  directory is already tolerated by the filesystem adapters.
- **Hide blocked Solo results.** Hidden entries read as missing catalog data
  and prevent the user from seeing what needs correcting.
