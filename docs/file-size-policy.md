# File Size Policy — Implementation

Warn at 400 effective lines, hard-fail above 500, Go and frontend alike, production code
and tests. **The operational rule is `AGENTS.md` → "Cross-Cutting File Size Policy"**;
this file carries only the implementation it delegates.

## What "effective line" means

Three counters enforce the policy and **none of them count the same thing**:

| Counter | Counts |
|---|---|
| `tools/checkgofilesize` (Go) | distinct lines that *start* a non-comment token |
| ESLint `max-lines` (TS/TSX) | physical lines, minus blanks and comments |
| `dharness/max-file-lines` | every physical line, blanks and comments included |

The Go counter keys on the line where each token begins (`main.go:283`), so a token
spanning lines is charged once — verified: a raw string across 5 physical lines adds **1**.
Skipping `token.COMMENT` and `token.SEMICOLON` is what drops blank and comment-only lines.
`dharness/max-file-lines` is deliberately the strictest — a file long because it is
documented is still long to read, and excluding comments would reward padding.

## Go implementation

`tools/checkgofilesize/{doc,main}.go` + `baseline.yaml`. Per file (`main.go:147-205`):

- `400 <= n <= default_max_effective_lines` → **warning** on stdout, exit 0. The 400 is a
  literal in the source (`main.go:165`); only the 500 comes from the manifest.
- `n > default`, not baselined → **`new file over 500`**, stderr, exit 1.
- `n > entry.max_effective_lines` → **`baseline growth`**, exit 1.
- baselined and at or under its ceiling → passes silently.

Warnings and violations can appear in the same run. The walk skips `.git`, `node_modules`
and `vendor` by name (`main.go:262`) *before* applying `exclude_paths` /
`exclude_file_patterns`. Glob matching is repo-owned, not `filepath.Match`: `**`→`.*`,
`*`→`[^/]*`, `?`→`[^/]` (`main.go:341`).

In `lefthook.yml` the `go-filesize` job sits in the `quick` group with `glob: "*.go"`,
after `gofmt` and before `golangci-lint`. The glob only decides *whether the job runs* —
once it runs it walks the whole repository, not the staged set.

### baseline.yaml

Keys: `version` (must be `1`), `default_max_effective_lines` (must be `> 0`),
`exclude_paths`, `exclude_file_patterns`, `files[]` of `{path, max_effective_lines,
reason}`. The maintenance rules are also comments at the top of the file itself.

Entries are validated at load, before any scanning (`main.go:114-144`), and rejected when
the path is missing, contains glob metacharacters, is a duplicate, has
`max_effective_lines <= default_max_effective_lines`, points at a file that does not
exist, or points at a file that is *not* actually oversized under deterministic counting.
`TestRepositoryBaselineTracksExactlyCurrentOversizedFiles` goes further: the baseline must
list **exactly** the currently oversized files, each ceiling **equal to that file's current
count**. A ceiling is a freeze at today's size, never headroom.

## Frontend implementation

- `frontend/eslint.config.js:71` — `'max-lines': ['error', { max: 500, skipBlankLines:
  true, skipComments: true }]`, scoped to `src/**/*.{ts,tsx}`. A Go test asserts this exact
  string; do not reformat the line.
- `.dharness/eslint.config.js` is spliced into that same config between the
  `// dharness:eslint-layer` markers by `dharness sync` (edits inside are overwritten),
  turning on `dharness/max-file-lines` with the threshold from `.dharness/rules.json`
  (`maxFileLines: 500`). It declares no `files:` key, so it covers everything
  `frontend-lint` lints (`**/*.{js,cjs,mjs,ts,tsx,mts,cts}`) — wider than repo `max-lines`.
- `frontend-lint` runs `bun x eslint {staged_files}` with `root: frontend`, judging only
  the staged set; whole tree is `bun --cwd="frontend" run lint` (`eslint .`).
- `frontend/scripts/check-file-size-warnings.mjs` (`filesize:warning`) is the 400 warning.
  It scans `src/**/*.{ts,tsx}` and sets `overrideConfigFile: true`, deliberately **not**
  inheriting `eslint.config.js`: that dragged in the type-aware preset and cost 47s of an
  88s gate, versus ~2s standalone with identical output. It never exits non-zero.

## Manual verification

```bash
go run ./tools/checkgofilesize            # Go: warnings + hard fail
go test ./tools/checkgofilesize           # Go: the checker's own suite
bun --cwd="frontend" run filesize:warning # frontend: 400 warnings, whole tree
bun --cwd="frontend" run lint             # frontend: 500 hard fail, whole tree
```

## Tests that pin this behavior

- `tools/checkgofilesize/main_test.go` — counting (blank/comment/CRLF/inline-block), 501
  `new file over 500`, 504 `baseline growth`, 503 at-ceiling passing, generated files
  excluded, 400 and 500 warning without failing, live repo baseline passing.
- `tools/checkgofilesize/baseline_validation_test.go` — the four entry rejections.
- `tools/checkgofilesize/hook_order_test.go` — the `gofmt` → `go-filesize` →
  `golangci-lint` order and the exact `run` string.
- `tools/checkgofilesize/repository_policy_test.go` — `frontend-lint` still exists, the
  exact ESLint `max-lines` line, the `package.json` scripts, the `baseline.yaml` comments.
- `frontend/scripts/__tests__/check-file-size-warnings.test.mjs` — collection/formatting.

## Maintenance

Shrink the file, or shrink its ceiling to the new count, in the same PR; remove the entry
once counting reaches `<=500`, since the baseline test fails on any drift. Comment padding
does nothing to the Go count and makes the dharness count worse. Plan the refactor at the
400 warning, not at the 500 failure.

## Change history

- **2026-06-27** (`c8a7a3b`) — 400-line warning added, all Go `>500` debt eliminated. This
  is why `files: []` is the expected baseline state.
- **2026-08-11** (`c8aaa4d`) — the frontend gate moved to dharness and
  `frontend-filesize-warning` left `lefthook.yml`. The 500 ceiling gained a second checker
  (`dharness/max-file-lines`); the 400 warning became manual.
