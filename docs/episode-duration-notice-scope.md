# Episode duration notice — ODD 3 scope, decisions and evidence

Scope record for the coordination units of the episode duration notice. Read this before planning
**3.2 (Today)** or any later unit of this feature; it carries the decisions, the reason for each and
the measurements behind them, so no unit has to re-derive them.

Companions: `docs/episode-duration-notice.md` (technical design), `docs/episode-duration-notice-odd3.html`
(the same scope as a diagram, in Spanish), `odd/tasks/episode-duration-notice.md` (work tracking).

## 1. Why ODD 3 was split

The unit covered both entry paths and had grown long. The natural cut is **by trigger**, not by layer:
one unit for the download that completes, one for the Today screen that opens. The acceptance cases
partition cleanly (1-3 downloads, 4-5 Today, 6-8 shared), which is the evidence the cut is real.

The pieces both paths need ship in the **first** unit, so the dependency has one direction only:
3.2 consumes what 3.1 delivers. No cycles.

## 2. Unit 3.1 — Downloads

**Deliverable.** When a download leaves a chapter that is out of the ordinary, **one notice** appears.
The episode number is irrelevant. The folder is read at the moment the file already exists and nothing
is stored.

| # | Case | Expected |
|---|---|---|
| 1 | A download leaves a chapter over 30 min (TV anime) | One notice, exactly once |
| 2 | The download leaves a normal or short chapter | Silence |
| 3 | The anime is not TV, or has no stored type | Silence |

## 3. Unit 3.2 — Today

**Deliverable.** On opening Today, every anime of the day whose next episode is out of the ordinary
**is marked**. Recalculated live: if the user renames or deletes a file, the mark reflects it on open.

| # | Case | Expected |
|---|---|---|
| 4 | Today, with a long next episode | The mark, on the correct file |
| 5 | Identity is inconclusive | Silence, naming no episode |

## 4. Shared acceptance cases

| # | Case | Expected |
|---|---|---|
| 6 | The folder is absent or unreadable | Silence, no zeros and no exception |
| 7 | `ffprobe` is not installed | Silence |
| 8 | After using the feature | Zero writes, zero new files, zero rows |

## 5. Which unit delivers each piece

| Piece | Unit |
|---|---|
| `MediaInventory` | **3.1**, shared with 3.2 |
| Type gate | **3.1**, shared with 3.2 |
| Finding (probe + rule + is-it-long) | **3.1**, shared with 3.2 |
| Coordinator A and the notice | 3.1 |
| Coordinator B | 3.2 |
| Confidence gate | 3.2 |
| Read contract, and the type in the data Today already returns | 3.2 |

## 6. Decisions

**D1 — The split is by trigger, and the shared pieces ship first.** Reason: the dependency must run
one way. Consequence to respect: `MediaInventory` returns **the complete inventory**, never "the newest
video". Choosing the file is a coordinator decision. If 3.1 shapes the inventory around its own need,
3.2 rewrites it.

**D2 — The folder capture is `MediaInventory`, at `internal/anime/media/`.** It captures the media
files of one folder and prepares them in the shape the identity algorithm consumes. It **lists,
filters by extension, reads the Windows creation and modification times, and reports failures**. It
does **not classify**: deciding which episode a file is belongs to the algorithm. Filtering is not
classifying, and a name promising classification invites logic into the wrong place. It is ports and
adapters, so it may be reused later — but it is built for this case and nothing more (KISS): no
generalization, no options nobody asked for.

**D3 — The video extension set is reused, not re-invented.** `internal/download/config.VideoFileExtensions`
already exists with a test pinning it to the prototype set. The inventory receives the set as a
parameter and the composition root passes the same one the download pipeline uses, so there is one
source of truth: the files the pipeline counts as episodes are exactly the files the inventory sees.
That coherence is a property we want, not an accident.

**D4 — The port is declared by the consumer.** `internal/download` declares a narrow interface and the
anime side implements it, so the download context imports nothing from anime, and a missing wiring
simply means no notice — the same degradation every optional seam in that service takes.

**D5 — The Path A hook is the end of `completeDownloadedEpisode`** (`internal/download/service_rename.go`),
after the rename. That function has three callers (`service_hoster_watch.go`, disk ahead
at entry, filesystem poll confirmed, disk confirmed after grace) and all three mean the same thing: the
episode landed. One hook point covers all three by construction, and at that moment the file is at the
folder root — exactly "the moment the file already exists".

**D6 — The type gate passes only `Kind == 0`.** `0` is documented as Anime (TV) in
`internal/api/contracts/contracts_test.go`. A `nil` type or any other value stays silent: assuming TV
could announce a movie, and failing closed is the rule for this feature. Note the same fact is named
`Kind` (contract), `Tipo` (download candidate), `ContentType` (domain) and `kind` (storage); this unit
does not unify that vocabulary.

**D7 — Path A takes its file from the folder.** The folder path is already persisted per anime
(`MobileAnime.Folder` / `EpisodeScheduleItem.FolderPath`), and the file path comes from listing that
folder at the moment the file exists, taking the newest video at the root — the criterion the download
code already documents on the JDownloader side ("the link JD finished last is the episode that just
landed"). No new registry, no
new event field.

**D8 — No duration cache, anywhere.** Rejected on measurement, see section 7.

**D9 — For 3.2, the mark rides in the same response Today already asks for.** No second round trip.

## 7. Measurements that decided D8

Taken on the real library (three folders, ffprobe 8.0 from scoop), read-only:

| Measurement | Result |
|---|---|
| One probe | 64–86 ms, **flat regardless of file size** (a 4.5 GB folder costs the same per file as a small one) |
| OS file cache | Barely helps: 8 files cold 690 ms vs warm 603 ms |
| 8 files sequential | 511–631 ms |
| 8 files at `-P8` | 261–304 ms — and those figures include one extra `sh` process per file that Go would not pay |
| ffprobe with several inputs | **Refused**: "Argument ... was already specified". One process per file is unavoidable |

The cost is **process creation**, not reading. A cache would save roughly 0.6 s on the second and later
Today opens; probing in parallel recovers most of that on **every** open with no state, no key, no
lifetime, no invalidation and no per-episode record. The remaining real decision is only a worker
bound (propose 4, or `min(4, N)`), and it belongs to 3.2 — 3.1 probes one file.

## 8. Rejected options, and why

| Rejected | Reason |
|---|---|
| Duration cache, session or otherwise | Does not pay for itself (section 7), and a per-episode record contradicts the architecture |
| A registry of downloaded files | Bridge never persists file state: it persists **anime** state (progress, folder, type) and re-derives everything about files, because the filesystem belongs to the user and can change at any moment |
| Asking JDownloader for the file name | JDownloader does report it (`DownloadLink.Name`) and `newestFinishedLink` already means "the episode that just landed", but that path runs only when the rename setting is on and its result is discarded into a log. The folder listing is simpler and does not depend on a setting |
| Comparing the folder before and after the run | Extra state in the flow to answer a question a plain listing already answers |
| A bespoke cache TTL | Would need an injected clock, more machinery, and covers nothing the key does not |

## 9. Known drift

`docs/episode-duration-notice.md` section 2 claims "the download event already names the file". That is
false and the document records the refutation with file and line evidence. `DownloadEpisodeDownloadedEvent`
carries `RunID`, `AnimeID`, `Episode`, `CorrelationID` only, and the landing is confirmed by a filesystem
**count** poll. Path A's file acquisition is D7 above.

## 10. 3.2 — Today: shape and remaining numbers

Two work units, fewer than 3.1 because it reuses the adapter, the finding and the type gate:

- **U4 — Coordinator B.** The decision: inventory, identity, the confidence gate, the type gate, the probe
  and the finding, producing a mark value. Provable with fakes. Probes run in parallel with a bound of
  **4** (`min(4, N)`): measured 8 files at `-P8` in 261-304 ms against 511-631 ms sequential, and a low
  bound keeps a slow or network disk from thrashing.
- **U5 — The delivery.** The mark in the schedule read model and in the contract, the mapping, the contract
  tests, the regenerated bindings, and the acceptance cases 4, 5 and the shared 6, 7, 8.

**The confidence gate has a measured answer.** The port carries no confidence field by design — no
calibrated probabilities — and its only documented invariant is "BasisNone always pairs with a nil
Next". The gate is therefore a rule to write, not a fact to inherit, and two candidates existed: accept
any non-nil `Next`, or accept one only when no ambiguity diagnostic accompanies it.

Measured over the real corpora (`internal/anime/identity/pairing_test.go`, which now gives the
invariant a machine owner and re-logs this tally):

| Split | Cases | Decided | Abstained | Decided **with** ambiguity |
|---|---|---|---|---|
| dev | 16 | 7 | 9 | **0** |
| supplemental | 4 | 4 | 0 | **0** |

The two rules are **identical on every case we have**, so the stricter one costs nothing today and keeps
the design's fail-closed stance for a folder nobody has seen yet: **accept a non-nil `Next`, and refuse
when an ambiguity diagnostic is present.** Basis distribution over the same corpora: dev direct-number
5, elimination 1, chronology 1, none 9; supplemental direct-number 3, chronology 1.

**Where the mark is computed is also open.** `EpisodeService` does not know the coordination today, and
adding it touches its constructor and its tests; enriching in the `internal/desktop` mapping would leave
the service alone but put a per-row rule in the layer meant to compose and not decide. The anime context
owns the decision, so the service is the intended home — at the cost of one dependency.

**The type needs no contract change.** `EpisodeService.ListEpisodeSchedule` already reads
`s.query.ListMobileAnimes`, and `MobileAnime.Kind *int` is right there, so the type gate takes its value
from the same pass. Putting the type on `EpisodeScheduleItem` would add a field no consumer needs — the
frontend never reads the type — which the "no field without a named consumer" rule forbids.

**The only contract change is the mark**: one field, whose named consumer is the ODD 4 surface.

## 11. Process lessons from this scoping

Three times in this feature a component entered the design because **I** wrote it there, not because a
requirement or a measurement demanded it: the bespoke coverage-tier gate, a duplicated `Identidad` box
in the diagram, and the duration cache. The rule to apply: a component that appears in my own
documentation is **not** a requirement until the user accepts it or a measurement demands it.
