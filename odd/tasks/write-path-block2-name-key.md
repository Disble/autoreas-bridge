Objective: block 2 of the anime write-path rebuild. Compute `anime_snapshots.name_key` in Go, store it as plain data, and drop the SQLite generated column, so no SQLite build or external tool can desync the uniqueness index again.
Branch: feat/write-path-block2-name-key (off dev dcabe114) · Delivery: ask-on-risk, local merge into dev · Runners: `go test`, ditto per owning package · Risk: item 1 (migration of stored data), so it gets an independent verifier.
Plan: artifact https://claude.ai/artifact/8AmVg9jk6D5Cs7rttPoCBH (block 2 "Los datos: la clave de nombre en Go").

## Specs

- S1. Plan text, verbatim: "La regla de "nombres únicos" deja de depender del `lower()` de SQLite. Una sola función de Go calcula la clave y la guarda como una columna normal. Una migración recalcula todas las claves y rehace el índice."
- S2. Key rule (decision 2026-10-25, preserves today's behaviour):
  - The key is the anime's `name` string with surrounding U+0020 spaces trimmed and ASCII A–Z lowered. This is exactly what SQLite's built-in `lower(trim(...))` produces today.
  - A snapshot whose `name` is absent or not a JSON string has a NULL key.
  - One Go function owns the rule; every writer uses it.
  Evidence that this changes no existing key: production holds 860 snapshots, all with a text name, 26 of them non-ASCII, and none with tabs or newlines around the name.
- S3. Plan acceptance, verbatim:
  - "La migración corre sobre una copia de tu `bridge.db` real."
  - "Los nombres con letras no inglesas, como "Ⅲ", conservan su clave."
  - "Si dos nombres chocaran, la migración lo reporta en vez de fusionarlos."
  - "La revisión de integridad sale limpia."
  A collision fails the migration with an error that names the colliding animes, and the transaction rolls back so the DB is left unchanged.
- S4. Every production statement that writes `anime_snapshots.snapshot_json` also writes `name_key` through the S2 function, and a machine owner enforces it (a `tools/checkarchitecture` rule or an equivalent test). Today the writers are:
  - `internal/sync/anime_snapshot_store.go:77`
  - `internal/sync/backup_import.go:88`
  - `internal/sync/vocabulary_migration_tables.go:129`
  - `internal/sync/write_base_store.go:244`
- S5. Owner, verbatim: "nada de código legacy, test legacies, helpers legacies, dead code, dead test… Después de cada fase, tienes que volver a validar con todos los dates, linters, etcétera." The previous generated-column migration code (`schema_tables.go:162-211`) and its tests are either reused or removed. Nothing dead may remain, and the block-1 referee stays green unchanged.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1–S5 | delegated writer `block2-writer` (one unit; the parent's context backstop) | done | this commit; ditto sync 0.90, checkarchitecture 0.94; 3 hand mutations killed |
| T2 | S1–S5 | independent verifier (risk item 1) | done | S1–S5 PASS, 0 blockers, 4 advisories |
| T3 | S5 | parent: gates, CodeGraph sweep, merge | pending | |

## Log

- L1 (2026-10-25, owner): "Apruebo todo. Empieza de una vez." (the plan: steps 0 and 0b, then blocks 1–5 in order, each its own ODD)
- L2 (2026-10-25, owner): process rules from block 1: no legacy or dead code; CodeGraph triangulation; fallow and react-doctor; all gates after each phase; prefer delegation; give agents loop counters and a heartbeat.
- L3 (2026-10-25): production name profile via the modernc driver, read-only: 860 rows, 0 without a name, 0 non-text names, 26 non-ASCII names, 0 invalid JSON. The Ⅲ desync came from an external ICU sqlite3 `lower()`; the app's own `lower()` is ASCII-only, hence S2.
- L4 (2026-10-25): T1 done.
  - `animeNameKey` is in `internal/sync/anime_name_key.go`.
  - The migration runs in one `persistence.InTx`, and SQLite allowed DROP COLUMN on the generated column.
  - All four writers set `name_key`. The rule lives in `tools/checkarchitecture/namekey.go`.
  - The old generated-column migration and its helpers were removed.
  - The parent removed a speculative `hidden == 3` (STORED) branch that killed no mutant; the app only ever created VIRTUAL.
- L5 (2026-10-25): T2 verifier PASS on S1–S5.
  - Key parity: 20,015 Unicode names, 0 mismatches against SQLite's own `lower(trim())`.
  - On both real DB copies: 860 rows, data digest unchanged, integrity ok. The desynced copy was repaired.
  - A duplicate fails atomically (DB file sha256 unchanged).
  - A full boot of baseline vs candidate gives identical digests over 35 tables.
  - Advisories:
    1. ADR-026 cited the retired expression; fixed in this commit.
    2. Rollback risk: a pre-block-2 binary opens a migrated DB without error but writes NULL keys, so uniqueness is silently off after a downgrade. Accepted: block 2 ships together with block 3 as the first release, and rollback to an older build is not planned.
    3. Out-of-domain: a duplicate JSON `name` member resolves last-wins vs SQLite first-wins.
    4. The rule checks that the column is present in one literal, not that the value comes from `animeNameKey`; the limit is documented in `namekey.go`.
  - Outside the repo: the gitignored `.ignore/cover-image-quality-migration/plan.go` updates `snapshot_json` without `name_key`; the rule skips dot directories. Reported to the owner.
