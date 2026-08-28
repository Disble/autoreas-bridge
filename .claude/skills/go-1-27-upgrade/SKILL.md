---
name: go-1-27-upgrade
description: Guide for migrating Go projects to version 1.27 and for writing idiomatic Go 1.27 code. Use it whenever any of these topics come up, even if the user never says "1.27" explicitly - upgrading the Go version, editing the `go` directive in go.mod, a `go.mod` or Dockerfile pinned to Go 1.2x, errors after updating the toolchain, "will this break anything if I upgrade?", removed GODEBUGs (asynctimerchan, tlsrsakex, gotypesalias...), encoding/json/v2 or jsontext, generic methods, `go fix` modernizers, the stdlib uuid package, crypto/mldsa or post-quantum Go, goroutineleak profiles, macOS 13 as the darwin minimum, or reviewing Go code for obsolete APIs and modernization opportunities.
---

# Migrating to Go 1.27 and writing idiomatic Go 1.27

Go 1.27 (August 2026) is a release with two faces. On one side almost nothing
breaks: the Go compatibility promise still holds and most projects compile without
touching anything. On the other side, this version swaps whole implementations
underneath (`encoding/json` now runs on v2, the memory allocator, `compress/flate`)
and removes several `GODEBUG` settings that had served as a safety net for years.
The real problems, when they show up, are not compile errors: they are silent
behavior changes in tests or in production.

That is why order matters: **first verify nothing broke, then modernize**. Mixing
both in the same commit makes it impossible to tell what caused a regression.

## How to use this skill

Identify what the user is asking for and go straight to the matching material.
There is no need to read every reference.

| Situation | What to do |
|---|---|
| "I want to upgrade to Go 1.27" / errors after upgrading | Follow the checklist below; read `references/migration.md` |
| Something broke and you suspect JSON | Read `references/json-v2.md` |
| Writing new code, or "modernize this" | Read `references/language.md` and `references/stdlib.md` |
| "What is new in 1.27?" | `references/stdlib.md` has the full per-package inventory |
| Reviewing a PR / code review | Use the "Code review signals" section below |

If the user has the project at hand, prefer running the real commands
(`go vet`, `go test`, `go fix`) over reasoning about the code from memory. The Go
tooling finds these problems far better than reading does.

## Migration checklist

This is the short path that resolves the vast majority of cases. The detail for
each step, including the concrete error messages and their causes, is in
`references/migration.md`.

1. **Before touching `go.mod`, install the toolchain and run the tests as they are.**
   `go1.27 test ./...` with the old `go` directive. This separates "the new
   compiler broke something" from "the new language version changed something":
   they are different causes and are worth ruling out separately.

2. **Check the platform requirements.** Go 1.27 requires macOS 13 Ventura or
   later; binaries no longer start on macOS 12 or earlier. In CI/CD, also check
   base images and macOS runners.

3. **Look for removed `GODEBUG` settings.** The ones that disappear in 1.27 are
   `asynctimerchan`, `gotypesalias`, `tlsunsafeekm`, `tlsrsakex`, `tls3des`,
   `tls10server` and `x509keypairleaf`. The `go` command now detects them in
   `go.mod` and in source code; if they were set to a non-default value, it fails
   with an error. An `asynctimerchan=1` still sitting there is a strong signal
   that some code depends on `time` channels being buffered — that code needs a
   real review, not a deleted line.

4. **Raise the `go` directive to `1.27` and run the tests again.** This is where
   the module-version-dependent changes kick in: goroutine labels in tracebacks,
   `go mod tidy` consolidating `require` blocks.

5. **Run `go vet ./...`.** The `stdversion` check now runs by default under
   `go test` and warns when you use symbols newer than the version declared in
   `go.mod`.

6. **Run the test suite with and without `GOEXPERIMENT=nojsonv2`.** If the results
   differ, the culprit is the new JSON engine and `references/json-v2.md` explains
   what to look at. `nojsonv2` is a temporary escape hatch: it exists to unblock a
   release, not to live in, because it will be removed in a future version.

7. **Only once steps 1 through 6 are green, modernize** with `go fix ./...` and the
   suggestions in `references/language.md`. Separate commit.

One detail that saves time: if tests fail with text differences in error messages,
check whether those tests compare stdlib error strings. `encoding/json` preserves
behavior but **not** the exact text of its errors, and that breaks brittle tests
with no real bug behind it.

## Risks ordered by how likely they are to bite

When someone asks "is this going to break anything?", this is the useful answer,
from most to least likely:

1. **Tests comparing `encoding/json` error text.** Very common, trivial to fix.
2. **Tests depending on `asynctimerchan=1`** (buffered `time` channels) or on
   `time.Timer`/`Ticker` timing. See `references/migration.md`.
3. **macOS 12 or earlier** on dev machines or CI. Breaks loudly and obviously.
4. **Legacy TLS**: if the project had `tlsrsakex=1`, `tls3des=1` or `tls10server=1`,
   those ciphers and that TLS 1.0 server are not coming back. The other end has to
   be updated.
5. **`compress/flate` golden files** — and those of `archive/zip`, `compress/gzip`,
   `compress/zlib` and `image/png`, which use DEFLATE underneath. The compressor
   improved; output may differ byte for byte from 1.26 even though it decompresses
   identically. It was never a guarantee, but some tests assume it.
6. **Tests comparing closure symbol names** or function pointers. The compiler
   simplified function literal names.
7. **`crypto/ecdsa`**: `PrivateKey.Sign` now validates the hash length when passed
   non-nil `SignerOpts`. Code that was signing a wrongly sized digest now fails —
   correctly.
8. **`net`**: `UnixConn` read methods return `io.EOF` directly instead of wrapped in
   a `*net.OpError`. Code that type-asserts on the error may stop detecting it.

## Code review signals

When reviewing Go code written for 1.27 or about to migrate, these are worth
flagging. The rationale for each is in the references.

- A package-level generic function that really operates on one concrete type: it
  can now be a generic method (`references/language.md`).
- `github.com/google/uuid` or another UUID dependency: the stdlib now ships `uuid`
  with `NewV4`/`NewV7`. Fewer dependencies, same RFC 9562.
- Last-separator searches with `strings.LastIndex` plus manual slicing:
  `strings.CutLast` / `bytes.CutLast` do it in one line with no off-by-one errors.
- Concurrency tests with arbitrary `time.Sleep` calls: `testing/synctest` and the
  new `synctest.Sleep` remove the flakiness instead of papering over it.
- HTTP tests using `httptest.NewServer`: `httptest.NewTestServer` uses an in-memory
  network, with no real ports and no startup races.
- Goroutines that could block forever: the `goroutineleak` profile is now stable and
  finds them.
- `tls.Config.Rand`: deprecated; for tests use `testing/cryptotest.SetGlobalRandom`.
- Public HTTP servers with no cap on repeated headers: `Server.MaxHeaderValueCount`
  exists.

## Accuracy warnings

Go 1.27 is recent and the experimental APIs are still moving. When giving concrete
details, a quick verification is worth more than a confident wrong claim:

- The `simd` and `simd/archsimd` packages require `GOEXPERIMENT=simd` and their API
  is **not stable**. Do not recommend them for production code.
- The opt-outs (`GOEXPERIMENT=nojsonv2`, `GOEXPERIMENT=nosizespecializedmalloc`) are
  temporary by design. The official notes say `nosizespecializedmalloc` is expected
  to be removed in Go 1.28.
- If the user needs the exact signature of a new API, look it up on `pkg.go.dev` or
  with `go doc` instead of reconstructing it from memory.
- The official notes are at https://go.dev/doc/go1.27 — that is the source of truth
  for any doubt.

## References

- `references/migration.md` — Breaking changes, removed GODEBUG settings, platform
  requirements, compiler/linker/runtime changes, and the step-by-step checklist with
  the symptoms of each failure.
- `references/json-v2.md` — `encoding/json` on v2, what changes and what does not,
  the compatibility `Options`, `jsontext`, and how to migrate to the v2 API if it is
  worth it.
- `references/language.md` — Generic methods, field selectors in struct literals,
  generalized type inference, and the `go fix` modernizers.
- `references/stdlib.md` — Full inventory of standard library additions in 1.27,
  package by package, with when to use each one.
