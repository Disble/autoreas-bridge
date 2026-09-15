# ADR-024: Cover thumbnails are derived once onto disk under a versioned spec

- **Status**: Accepted, implemented (SDD-74)
- **Date**: 2026-09-14
- **Supersedes**: nothing
- **Related**: `openspec/changes/2026-09-14-sdd-74-mobile-covers/design.md` (D2-D6 — the typed loader,
  the derived cache, the pure transform and the two-slot service this ADR records), `explore.md`
  ("Measured cover distribution" — the corpus this ADR's receipt was taken against),
  `openspec/changes/2026-09-14-sdd-74-mobile-covers/specs/anime-cover-thumbnails/spec.md`,
  `internal/anime/cover/{loader.go,thumbnail_cache.go,thumbnail_service.go}` and
  `internal/anime/cover/thumbnail/transform.go`

## Context

Bridge owns anime cover state, and a cover is either a URL (its bytes cached under
`covers/<sha256(url)>.img`) or a local file path. Before SDD-74 the only consumer was the desktop
binding `App.GetAnimeCover`, which resolved the cover and returned the **original** bytes as a
`data:` URL — up to 10 MiB of base64 for a box no larger than 96 CSS px. Mobile had no cover route at
all, and an older bridge answers `404` for one. Neither surface needed the original; both needed a
small, cacheable JPEG with a validator.

The real corpus is bimodal, and that shape decides the design. Measured from a bridge backup (839
anime snapshots, 2026-09-03) and the live raw cache:

| Cover | Format | Dimensions | Pixels | Size |
|---|---|---|---|---|
| 6 URL-cache entries | JPEG | 116x180 | 20,880 | 6-9 KB |
| 1 URL-cache entry | JPEG | 424x600 | 254,400 | 161 KB |
| 1 local file | JPEG | 704x1000 | 704,000 | 168 KB |
| 1 local file | JPEG | 1880x1178 | 2,214,640 | 155 KB |
| 1 cover value | literal `null` | — | — | — |

Six of the nine images are already shorter than the 320 px target, so the common case is *proof of
decodability*, not resampling. The rare case is 2.2 megapixels of work. A design that treats both
alike either pays for resampling that is not needed or under-estimates the memory one large cover
costs.

**Measured receipt (the resampler decision's evidence).** `BenchmarkTransformCorpus` in
`internal/anime/cover/thumbnail/transform_benchmark_test.go`, run against a read-only copy of that
corpus on 2026-09-14 with `go test -run '^$' -bench BenchmarkTransformCorpus -benchmem`, Go 1.27,
windows/amd64, one iteration per row. The benchmark's own sub-benchmark names carry the path each
cover takes, so this table is reproducible rather than narrated:

| Cover | Path | ns/op | B/op | allocs/op |
|---|---|---|---|---|
| 116x180 URL cover (x6) | pass-through | 204,303-245,851 | 77,139-77,170 | 16-18 |
| 424x600 URL cover | generated (pre-shrink skipped) | 12,452,934 | 6,262,384 | 42 |
| 704x1000 local cover | generated (pre-shrink engaged) | 27,686,340 | 28,890,101 | 56 |
| 1880x1178 local cover | generated (pre-shrink engaged) | 68,686,631 | 78,179,345 | 54 |

A second run reproduced the same paths and alloc counts with timings 1.5-1.8x higher while the
machine was busy, so read these as the shape of the cost (microseconds for pass-through,
tens of milliseconds and megabytes for generation), not as a stable benchmark score.

Two facts in that table drive the decision. First, the pass-through path still allocates ~77 KB and
costs ~0.24 ms because it *fully decodes* the bytes to prove they are a valid JPEG before serving
them unchanged — cheap, and the only way to refuse a truncated file. Second, a generated thumbnail
costs 12-69 ms and 6-78 MB of transient allocation, scaling with source pixels rather than with the
320 px result: the 1880x1178 cover is 8.8x the pixels of the 704x1000 one and costs 2.5x the time.
That is why generation must happen once, off the repeat-request path, and why concurrency is bounded.

## Decision

### D1 — The transform is a fixed, versioned spec: 320 px height fit, no upscaling, JPEG q80

`internal/anime/cover/thumbnail` is a pure function of bytes: `Transform(data, Options) (Result,
error)`. It rejects any format whose decoder is not registered in v1 (SVG, ICO, BMP, and every other
`image/*` body), rejects `> 16,777,216` pixels from `image.DecodeConfig` **before** a full decode,
serves an already-short JPEG byte-for-byte only after proving it fully decodes, and otherwise
flattens alpha over the bridge's `#1B2636` and resizes with a Box pre-shrink followed by one
CatmullRom pass. The `Result` carries the served bytes and a strong ETag computed from exactly those
bytes, so the validator and the payload cannot disagree. `SpecVersion` names the rule set; changing a
rule means bumping it, which lands the new entries in a different cache directory (D4).

EXIF orientation is deliberately **not** applied: measured across the corpus and the raw cache, zero
orientations tags are present, and honouring them would add a second decoder dependency for a case
the real data does not contain.

### D2 — Source identity is the cache key, and it is derived, not guessed

A local source's identity is its path, size and mtime; a URL source's identity is the SHA-256 of the
**complete origin bytes**. The URL identity is persisted in a write-once sidecar (`<key>.sha256`)
beside the raw cache entry, and a pre-SDD-74 `.img` entry without one is hashed once and given a
sidecar on first use (lazy migration). The sidecar exists so a raw-cache hit never has to re-derive
identity from the bytes it would otherwise re-read, and so an origin whose bytes were repaired
elsewhere still keys the derived entry it actually served.

### D3 — The derived cache is versioned, write-once, and commits metadata last

Entries live at `<cache root>/thumbs/v<spec>/<identity key>.jpg` with a `<identity key>.json`
metadata file. The metadata is written **last**, so its presence is the commit marker: a JPEG without
metadata is treated as absent rather than served, and metadata that disagrees with the JPEG's size is
discarded. Entries in other spec-version directories are cleaned up, as are temporary files older
than one hour. The `SpecVersion` directory is what makes a rule change a *cache miss* instead of a
mixed-version cache.

### D4 — Publication is unique-temp then rename, and "the final name already exists" is success

Every write goes to a process-unique temporary name and is then renamed onto the final name. On this
target a rename onto an existing file is treated as success rather than an error, because two
concurrent derivations of the same key are both correct and whichever lands second must not fail.
This is not defensive style — it is measured Windows behaviour, recorded in WU2's receipt: `os.Rename`
onto a destination held open fails with `Access is denied` (Go opens files without
`FILE_SHARE_DELETE`), while a destination read via `os.ReadFile` is closed by rename time. The same
probe measured `os.Remove`/`os.RemoveAll` failing identically against an open handle, which is why
cleanup tolerates a failed removal while keeping the first error it saw.

### D5 — Exactly two transforms run at once, and only transform work holds a slot

`ThumbnailService` composes the loader, the derived cache and the transform behind a two-token gate.
Loading, fetching, cache reads, cache writes, ETag comparison and base64 conversion happen **outside**
the gate; only decode, flatten, pre-shrink, resize and encode hold a token. The bounded HTTP acquire
waits a fixed interval and then reports saturation (which the route answers `503` with
`Retry-After: 5`); the desktop acquire waits instead, because the desktop already shows a placeholder
and a session-long wait is the existing contract there. Two slots is the memory bound: the measured
worst case is 78 MB of transient allocation for one cover, and the gate is what keeps that number
from multiplying with concurrent requests.

### D6 — Delivery reuses one service for both surfaces

`GET /api/animes/{id}/cover` and the desktop binding `App.GetAnimeCover` call the *same* service and
the same cache; neither re-implements the transform, and the desktop no longer base64-encodes
originals. The API seam is deliberately left unwired (503) in the unit that adds the route, so a
partially deployed bridge reports "cannot serve" rather than silently serving originals again.

## Consequences

- Repeat requests for a cover are a disk read plus an ETag compare; the 12-69 ms above is paid once
  per (identity, spec version), which is what the derived cache is for.
- Worst-case transient allocation is bounded at two concurrent generated thumbnails (~156 MB at the
  measured maximum), not by request count.
- v1 limitations, stated so a future slice does not have to rediscover them: EXIF orientation is
  ignored; ICO/SVG/BMP are refused with `204` rather than converted; MPO/animated WebP serve their
  first frame; the 116x180 MAL thumbnails are never upscaled, so those covers stay small; an orphaned
  `.sha256` sidecar (raw `.img` deleted by hand) is inert rather than cleaned, because the raw cache
  has no expiry; and garbage collection beyond the version-directory sweep and the one-hour temp
  sweep is deferred.
- `golang.org/x/image` becomes a direct dependency for `draw` (CatmullRom + the generic `Kernel` used
  for the Box stage) and for the WebP decoder the standard library does not ship. `go mod tidy` also
  raises `x/sys` and `x/text`, which that module's own `go.mod` requires; the rollback is `go mod
  tidy` after reverting the import, since nothing else in the tree uses it.

## Alternatives considered

1. **Serve originals with a data URL (status quo).** Rejected: mobile cannot use a data URL, and the
   desktop paid up to 10 MiB of base64 for a postage-stamp box.
2. **Resize per request with no disk cache.** Rejected on the receipt above: 12-69 ms and 6-78 MB per
   request, on a path that is hit for every list render.
3. **Serve the thumbnail from a local HTTP/AssetServer URL instead of wiring the service into the API.**
   Rejected: Wails v2.15's `AssetServer.Middleware` is shadowed by the Vite dev proxy, so the same
   code would behave differently in dev, and it would add a second, differently-authenticated
   delivery surface for data the authenticated API already exposes.
4. **Store derived thumbnails in SQLite beside the snapshots.** Rejected: a derived thumbnail is a
   regenerable cache, not anime state, and the store's own rule is that `anime_snapshots` is the sole
   source of truth for state. Putting a cache in the state database would make the database's size a
   function of view traffic.
5. **Zero-copy streaming of the generated JPEG.** Rejected for v1: the response needs a
   `Content-Length` and a strong ETag computed over exactly the served bytes, both of which the
   in-memory buffer gives for free. It is deferred, not refused, if profile evidence ever demands it.
