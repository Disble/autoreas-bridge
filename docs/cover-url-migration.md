# Cover URL migration (disposable one-shot script)

Status: **never applied to the live database.** The author rehearsed the script on an isolated copy
derived from a read-only read of the live database: the preview found 18 snapshot and 13 season rows
to convert, `-apply` on that copy created a backup and reported `applied 31 row(s)`, and a second
run reported `nothing to change`. The live database itself was only ever read. The existing read
authorization does not authorize applying the script to it, and nothing in the Bridge lifecycle
calls it.

**Note (2026-10-26):** the `anime_write_operations` table the staged-reservation skip below reads was dropped, so
that skip describes a database shape that no longer exists.

## Why it exists

The forward-only cover policy (480 px ceiling, JPEG quality 85) fixed how Bridge renders new
derivatives. Some already-stored anime records still point at MyAnimeList's *resized* artwork URLs
(`/r/<width>x<height>/images/...`), which is the low-resolution source behind the blurry covers.
Production code never rewrites stored URLs, so correcting the existing rows is a one-time,
throwaway operation: a standalone Go program under `.ignore/cover-image-quality-migration/` that
you run by hand, once, and then discard.

The script is outside the application: it does not import the desktop shell, the sync bootstrap or
any wiring that opens or migrates the app database, and it makes no network request at any point.

## What it changes

| Table | Column | Change |
|---|---|---|
| `anime_snapshots` | `snapshot_json` | `cover.path` replaced with the original artwork URL |
| `anime_snapshots` | `snapshot_hash` | SHA-256 of the new bytes |
| `anime_snapshots` | `modified_at` | `max(nowMillis, old + 1)`, always ahead of the old token |
| `season_animes` | `metadata_json` | `cover.path` replaced with the original artwork URL |

Everything else is preserved byte for byte: unknown and legacy snapshot keys, other `cover` keys,
other confirmed metadata keys, `match_candidates_json`, every other column, and every other row.
Snapshot rewrites use the store's canonical encoding (sorted keys, raw values untouched), which is
exactly what `internal/anime/store/wire.go` writes.

`season_animes` rows are considered only when `metadata_json` is a JSON object with a convertible
`cover.path`. SQL `NULL` metadata stays `NULL` and is not selected at all.

## Conversion rule

A value is converted only when it is exactly:

- scheme `https`,
- host `cdn.myanimelist.net`, with no userinfo and no port,
- path `/r/<digits>x<digits>/images/<non-empty remainder>`.

The new value drops the `/r/<W>x<H>` segment and the query string; scheme, host, the remaining path
and any fragment stay identical. Everything else is counted and reported as **unchanged** and left
byte-identical: `http`, another host, an already-original URL, an unknown shape, a local filesystem
path, an empty value or the literal `null`.

A convertible row is **skipped** (reported, never changed) when:

- the stored `snapshot_hash` is not the SHA-256 of the stored `snapshot_json` bytes,
- `anime_write_operations` holds a `staged` row for that anime, or
- the row's `modified_at` is already `math.MaxInt64`, where the next token would overflow; the row
  keeps its exact bytes instead of corrupting the ordering.

## Requirements

- Bridge must be **stopped** before applying: it owns the database file.
- `-db` must be an absolute path to an existing file. There is no home-directory, environment or
  default-path discovery, and the script never creates a database.
- `-apply` additionally requires `-backup` naming a path that **does not exist yet**. The backup is
  written with `VACUUM INTO` before the first write. An existing backup is never overwritten,
  deleted or "refreshed"; a second run needs a new backup path.

## Commands

Preview (default, read-only, writes nothing):

```bash
go run ./.ignore/cover-image-quality-migration/ -db "<absolute path to bridge.db>"
```

Apply, with a fresh backup path:

```bash
go run ./.ignore/cover-image-quality-migration/ \
  -db "<absolute path to bridge.db>" \
  -apply -backup "<absolute path that does not exist yet>"
```

The live database lives at `%AppData%/Autoreas/data/bridge.db`
(`C:/Users/User/AppData/Roaming/Autoreas/data/bridge.db`) on Windows; pass it explicitly.

Run the package by explicit path: Go's package patterns ignore dot-directories, so `./...` never
reaches it. The repository's filesystem-wide `gofmt` and file-size gates do walk `.ignore/`, so the
script stays formatted and under the 500 effective-line limit.

## Output

stdout carries the plan and the totals, one line per class:

```text
mode: preview
anime_snapshots <anime-id>: <old url> -> <new url>
season_animes <row-id>: <old url> -> <new url>
anime_snapshots totals: converted=<n> unchanged=<n> skipped=<n>
season_animes totals: converted=<n> unchanged=<n> skipped=<n>
skipped reasons: hash-mismatch=<n> staged-reservation=<n> token-exhausted=<n>
backup: <path>                    # apply only, when a write happens
result: preview only, no writes | applied <n> row(s) | nothing to change
```

stderr carries diagnostics: one `unchanged <table> <id>: ...` or
`skipped <table> <id>: <reason> (<detail>)` line per row that is not converted, plus the error that
ended a refused or aborted run. A preview of a WAL-state database prints no plan at all: it stops
with the refusal message and writes nothing.

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success, including "nothing to change" and an explicit `-h` |
| 1 | unexpected error |
| 2 | usage error: missing `-db`, unknown flag, unexpected argument, `-backup` without `-apply` |
| 3 | refused precondition: relative, absent or non-regular `-db`; `-apply` without `-backup`; existing `-backup`; `-backup` equal to `-db`; unreadable schema; WAL-state database on preview |
| 4 | aborted verification or transaction; the write transaction rolled back, so no row changed |

Exit 1 is the unexpected-internal-error path. No documented input reaches it, so the suites prove
it by calling the error-to-exit-code mapping with an unknown error instead of forcing it through
the command line.

## Safety properties

- The preview opens the database with `mode=ro` and verifies `PRAGMA query_only=1`; it writes
  nothing. That alone is not enough: SQLite can still create or reuse `-wal`/`-shm` sidecars for a
  WAL database through a read-only connection, so the preview first inspects the file state. It
  reads the SQLite header (bytes 18 and 19 carry the journal format: `1` is the legacy rollback
  journal, `2` is write-ahead logging) and stats the sibling `<db>-wal`. A header declaring WAL, or
  a `<db>-wal` holding bytes, refuses the preview with exit 3 and an actionable message: stop
  Bridge and rerun, or rehearse the preview on a copy. `-apply` is unchanged because Bridge must be
  stopped for it anyway.
- Every changed row is written in one transaction owned by `persistence.InTx`, the repository's only
  transaction opener, under a guard built from stored values, not from a byte-for-byte comparison of
  the whole row. A snapshot update addresses the row by `anime_id` and
  requires the stored `snapshot_hash` to still equal the digest of exactly the bytes that were
  planned; a season update addresses the row by its `id` and requires the stored `metadata_json` to
  still match the value that was planned. One structural failure or one guard miss rolls the whole
  batch back, leaving no partial write.
- Rows that cannot be verified are skipped and reported, never silently changed.
- A second `-apply` finds nothing to change, creates no backup, and leaves hashes and `modified_at`
  tokens untouched.
- This script does not clear caches, publish sync events, touch Android state or promise a tablet
  refresh; mobile resynchronization is explicitly out of scope for this feature.

## Rollback

1. Stop Bridge.
2. Replace `bridge.db` with the backup written by `-apply`.
3. Remove any stale `bridge.db-wal` and `bridge.db-shm` next to the restored file.

Restoring the backup restores the whole database exactly as it was when the backup was taken,
including every `snapshot_hash` and every `modified_at` token, and it discards every change made
after that point, from this script or from any other writer. Removing the sidecars matters too: a
stale WAL replayed on top of a restored database would resurrect part of the newer state. Restore
only what you intend to lose; if other work happened after the migration, recover that work rather
than assuming the backup is additive.

## Checksums

The script is four files. The combined digest is the SHA-256 of their concatenation in exactly this
order: `main.go`, `convert.go`, `plan.go`, `apply.go`.

```text
combined  6f6df73187b7ccf1aa681c75e9b32dbc59e4c44ddcf490a3d8487610805c77ad
main.go   e47d65100be69173030886ef01e4b3d941d69417d2fff855316705fd316964f8
convert.go f7acd874fcd866cd88a527481e29757c9fce873bf799ae7ac72d9cc5fd683b82
plan.go   b7281135e693a883d5ee4251a2472d95f5c60051c292119db4b8a956fe5442a9
apply.go  0d063ae5c9e9455469cbd0c0b87ff6533a53f1ea678530d4387846deb3aff37a
```

Reproduce from the repository root:

```bash
cd .ignore/cover-image-quality-migration && sha256sum main.go convert.go plan.go apply.go
cat main.go convert.go plan.go apply.go | sha256sum
```

Verify before applying anything: a digest mismatch means the script is not the one that was tested.

## Tests

```bash
gofmt -l .ignore/cover-image-quality-migration
go vet ./.ignore/cover-image-quality-migration/
go test -count=1 ./.ignore/cover-image-quality-migration/
```

The suites build real temporary SQLite databases from the production DDL shape of
`internal/sync/schema.go` and `internal/season/schema.go`, observe results through a separate
read-only connection, and assert exit codes plus both streams. The built binary is compiled with
`go build` into a temporary path and executed for exits 0, 2, 3 and 4; exit 1 is proven through the
error-to-exit mapping. Covered behaviours: preview writes nothing (including no `-wal`/`-shm`), a
WAL-header or stale `-wal` database is refused on preview, apply converts while preserving unrelated
keys, non-convertible values stay byte-identical, `NULL` metadata stays `NULL`, hash-mismatch,
staged-reservation and token-exhausted rows are skipped and reported, existing backup and
apply-without-backup are refused, the second apply is a no-op that creates no backup, the snapshot
and season guards plus a failing row all roll back without partial writes, and the tokens never move
backwards.

## Disposal

Keep the script only until the correction is applied (or decided against). After that it can be
discarded: no production code, migration or lifecycle step depends on it.
