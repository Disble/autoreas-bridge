# Verification Evidence — Global Go File Size Policy Slice 2

Direct inspection is mandatory.

## Runtime-truth files inspected

- `lefthook.yml`
- `tools/checkgofilesize/main.go`
- `tools/checkgofilesize/baseline.yaml`
- `AGENTS.md`
- `CLAUDE.md`
- `docs/architecture.md`
- `app.go`
- `internal/anime/domain/anime_raw.go`
- `internal/download/service_test.go`

## Hook wiring evidence

- `lefthook.yml` adds `go-filesize` with `go run ./tools/checkgofilesize`.
- The job sits after `gofmt` and before `golangci-lint` in the deterministic Go gate sequence.

## Direct inspection findings from real repository files

- `app.go` is 727 physical lines in the repo and remains baselined at 635 effective lines.
- `internal/anime/domain/anime_raw.go` is 708 physical lines in the repo and remains baselined at 584 effective lines.
- `internal/sync/sqlite_bootstrap.go` is 588 physical lines in the repo and is intentionally absent from the baseline because deterministic counting keeps it within policy.
- `app_test.go` is 1949 physical lines in the repo and remains baselined at 1595 effective lines.
- `internal/download/service_test.go` is 1049 physical lines in the repo and remains baselined at 865 effective lines.

## Negative validator evidence that must stay reviewable

- The validator reports `new file over 500` for non-baselined first-party Go files above the ceiling.
- The validator reports `baseline growth` when a legacy debt file exceeds its committed ceiling.
- Quoted failure header from the real command path: "Go file size check failed:"

## Commands executed in this apply slice

- `go test ./tools/checkgofilesize` → PASS
- `go run ./tools/checkgofilesize` → PASS (`Go file size check passed.`)
- `go test ./tools/checkgofilesize -run TestRunReportsViolationsAndSkipsExcludedFiles` → PASS; proves the failure output for `new file over 500` and `baseline growth`
- `go test ./tools/checkgofilesize -run TestRepositoryBaselineTracksExactlyCurrentOversizedFiles` → PASS; proves the live repo baseline matches the current oversized-file set
- `go test ./...` → PASS

## Direct inspection checkpoints for final orchestrator verify

1. Read `lefthook.yml` and confirm the hook order from source.
2. Read `tools/checkgofilesize/main.go` and confirm deterministic counting plus baseline and exclusion semantics.
3. Read `tools/checkgofilesize/baseline.yaml` and confirm the maintenance comments and current debt entries.
4. Read `app.go`, `internal/anime/domain/anime_raw.go`, and `internal/download/service_test.go` against the baseline contract.
5. Run `go run ./tools/checkgofilesize` on the real repository.
6. Run a negative temp-fixture check that proves the command fails for both `new file over 500` and `baseline growth`.

## Why this artifact exists

Hook success output alone is insufficient. Final verification must inspect real source, real policy inputs, and negative command behavior before the change is accepted.
