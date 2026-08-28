# Migrating to Go 1.27: breaking changes and the detailed checklist

Contents:

1. [Platform requirements](#1-platform-requirements)
2. [Removed GODEBUG settings](#2-removed-godebug-settings)
3. [Runtime behavior changes](#3-runtime-behavior-changes)
4. [Compiler and linker changes](#4-compiler-and-linker-changes)
5. [`go` command changes](#5-go-command-changes)
6. [Standard library behavior changes](#6-standard-library-behavior-changes)
7. [Step-by-step checklist with symptoms](#7-step-by-step-checklist-with-symptoms)

---

## 1. Platform requirements

### darwin: macOS 13 minimum

Go 1.27 no longer supports macOS 12 or earlier. Binaries built with 1.27 do not
start on those versions. The linker now emits `LC_BUILD_VERSION` with a minimum
macOS version of 13.0.0 and a default SDK version of 26.2.0.

Where this usually hurts: CI runners on old macOS images, and development machines
that were never updated. If you need to target a different OS or SDK version, the
linker accepts the new `-macos` and `-macsdk` options.

### linux/ppc64 (big endian): ELFv2 ABI

The big-endian `linux/ppc64` port now produces binaries using the system ELFv2 ABI.
It requires Linux kernel 3.13 or later (the RHEL7 backport on 3.10 also works). In
exchange it now supports cgo, PIE and external linking, none of which were available
before.

As with every other port, pure Go programs still produce statically linked binaries
by default using internal linking; if a program uses cgo and you need a pure-Go
static binary, `CGO_ENABLED=0` is the way. If the project depends on linking details
on this port, verify it by building rather than assuming.

---

## 2. Removed GODEBUG settings

`GODEBUG` settings are the Go safety net: they let you restore the old behavior when
a change breaks something. They have an expiry date, and several expire in 1.27. The
`go` command now **detects these settings** both in `go.mod` and in `//go:debug`
directives in source code. If the value matches the final default they had before
removal, it is accepted silently; otherwise it errors out.

This matters conceptually: deleting the line from `go.mod` makes it compile, but
fixes nothing. If the setting was there with a non-default value, someone put it
there because the code depended on the old behavior. That is what needs fixing.

| GODEBUG | Introduced | What it restored |
|---|---|---|
| `asynctimerchan` | Go 1.23 | Buffered (asynchronous) channels in `time.Timer`/`Ticker` |
| `gotypesalias` | Go 1.22 | Old alias behavior in `go/types` |
| `tlsunsafeekm` | Go 1.22 | Unsafe Exported Key Material in TLS |
| `tlsrsakex` | Go 1.22 | RSA key exchange cipher suites |
| `tls3des` | Go 1.23 | 3DES cipher suites |
| `tls10server` | Go 1.22 | Server accepting TLS 1.0 |
| `x509keypairleaf` | Go 1.23 | Old `X509KeyPair` behavior regarding the leaf certificate |

The removal of `tlskyber` is also documented; it actually happened in Go 1.24
without being announced.

### The `asynctimerchan` case

This is the most likely one to bite. Since Go 1.23, channels created by the `time`
package are unbuffered (synchronous), which makes timers and tickers
garbage-collectable and gives `Stop`/`Reset` predictable semantics. In 1.27 there is
no way back.

If the code depended on the buffering, the typical symptoms are:

- A non-blocking `select` on `timer.C` that used to receive a stale queued value and
  now falls through to `default`.
- Tests that assumed they could read from `ticker.C` after calling `Stop`.
- Logic that counted "accumulated" ticks while the goroutine was busy.

The correct fix is not a hack but rethinking the logic: read from the channel in the
same `select` as the main loop, or use `testing/synctest` in tests to control time
deterministically instead of depending on real timing.

---

## 3. Runtime behavior changes

### Goroutine labels in tracebacks

In modules with a `go 1.27` directive or later, traceback headers now include
`runtime/pprof` goroutine labels. This is a clear improvement for debugging
production panics — suddenly you know which request or which worker that goroutine
was.

If you have traceback parsers (alerting, crash aggregators), the header format
changes and they may need adjusting. It can be turned off with
`GODEBUG=tracebacklabels=0`, and that opt-out is going to keep existing
indefinitely.

### Size-specialized memory allocation

The compiler now generates size-specialized allocation routines. Small allocations
(under 80 bytes) drop up to 30% in cost, with an overall improvement of around 1% in
allocation-heavy programs. The price is roughly 60 KB of extra binary size.

Opt-out: `GOEXPERIMENT=nosizespecializedmalloc` at build time. It is expected to
disappear in Go 1.28, so if you enable it, treat it as debt with a due date.

### Goroutine leak profile (now stable)

The `goroutineleak` profile, experimental in Go 1.26, becomes generally available.
It detects goroutines blocked on concurrency primitives that can never be unblocked
again, using the garbage collector reachability analysis.

```go
// Programmatically
p := pprof.Lookup("goroutineleak")
p.WriteTo(os.Stdout, 1)
```

Over HTTP, importing `net/http/pprof`, it is exposed at
`/debug/pprof/goroutineleak`.

An honest limitation: it does not detect leaks involving global variables, nor those
depending on local variables of runnable goroutines. It is a high-value tool but not
a proof of absence.

`GOEXPERIMENT=goroutineleakprofile` was removed — it is no longer needed.

---

## 4. Compiler and linker changes

### Simplified function literal names

Closures now have simpler and more consistent names, regardless of whether they were
inlined. Several inlined instances may share code.

Practical consequences:

- Tests that verify symbol names (for example, by inspecting `runtime.FuncForPC`
  output) may need updating.
- Programs comparing function code pointers for equality — something that was never
  guaranteed in Go — may see new behavior. If you find this in a code review, it is
  a latent bug that 1.27 exposed, not a regression.

### `//line` directives with relative paths

`//line` and `/*line*/` directives now resolve relative file names against the
directory of the file containing them, the same way `go/scanner` does. Absolute
paths are unchanged. This mostly affects code generators.

### New linker options for macOS

`-macos` and `-macsdk` let you specify the OS and SDK versions emitted in the
`LC_BUILD_VERSION` load command. Defaults: macOS 13.0.0 and SDK 26.2.0.

---

## 5. `go` command changes

### Bazaar (`bzr`) removed

Modules can no longer be fetched directly from `bzr` servers. If any module in the
dependency graph lives in Bazaar, it has to be vendored or the repository moved.

### `go test` runs `stdversion` by default

The `stdversion` vet check warns when you use standard library symbols newer than
the Go version configured in `go.mod`. This catches the classic mistake of using a
1.27 API in a module that declares `go 1.24` — which compiles on your machine and
fails on someone else's with a different toolchain.

### `go test -json` with `OutputType`

`"Action":"output"` lines may now include an optional `"OutputType"` field with the
values `"error"`, `"error-continue"` or `"frame"`. Useful for tools that consume
test output.

### `go mod tidy` consolidates `require` blocks

For modules with `go 1.27` or later, `go mod tidy` merges duplicate `require` blocks
into the standard two-block structure: direct dependencies first, indirect ones
after. It preserves associated comments.

An expected side effect: the first `go mod tidy` after raising the directive can
produce a large diff in `go.mod`. It is cosmetic, but it is worth doing in its own
commit so it does not pollute the review.

### Improved `go doc`

- `package@version` syntax: `go doc example.com/pkg@v1.2.3`
- A `-ex` option to list the runnable examples of a package, and to print an
  example source with its comments when you name one.

### `go tool trace -http` listens on localhost only

If you pass only a port (`-http=:6060`), it is now restricted to localhost. To
listen on all addresses you have to be explicit: `-http=0.0.0.0:6060`. This is
consistent with `go tool pprof` and avoids exposing traces by accident.

### Response files in the tools

`compile`, `link`, `asm`, `cgo`, `cover` and `pack` accept response files (`@file`)
in a GCC-compatible format: space-separated arguments, quoted strings, escape
sequences, and continuation with backslash plus newline. This solves command line
length limits in very large builds.

---

## 6. Standard library behavior changes

### `encoding/json` on v2

`encoding/json` is now implemented on top of `encoding/json/v2`. Marshal and
unmarshal behavior is **preserved**, but **the exact text of error messages may
differ**. The v1 API is still supported and there is no obligation to migrate.

Opt-out: `GOEXPERIMENT=nojsonv2` at build time restores the original v1
implementation. It is expected to be removed in a future version.

Full detail in `json-v2.md`.

### `compress/flate` compresses faster — and drags four more packages along

Compression speed improved and **the output may differ from Go 1.26**. The output is
still valid flate and decompresses identically, but any test comparing compressed
bytes against a golden file is going to fail. The format never guaranteed byte-level
stability across versions.

The important part: DEFLATE is the underlying compression of `archive/zip`,
`compress/gzip`, `compress/zlib` and **`image/png`**, so the output of those four
packages may have changed too. It is easy to regenerate the flate goldens, declare
victory, and then discover that the reference `.png` files in the render tests fail
as well. `image/png` is the case that surprises people most, because nobody thinks
of a PNG as "a flate-compressed file".

### `crypto/ecdsa`: hash length validation

`PrivateKey.Sign` now validates that the hash length is correct when passed non-nil
`SignerOpts`. Code that passed a wrongly sized digest now fails instead of silently
producing an invalid signature.

### `net`: unwrapped `io.EOF` in `UnixConn`

`UnixConn` read methods return `io.EOF` directly instead of wrapped in a
`*net.OpError`. Code that type-asserted to `*net.OpError` to detect end of stream
stops detecting it. The correct form was always `errors.Is(err, io.EOF)`.

### `net/http`: behavior changes

- **Automatic body draining in HTTP/1**: the response body is drained
  automatically, which improves connection reuse.
- **RFC 9218 client priority in HTTP/2**: the server accepts client priority
  signals. Opt out with `Server.DisableClientPriority`.
- **New `Server.MaxHeaderValueCount`** and the `DefaultMaxHeaderValueCount`
  constant, to limit how many values a single header can have. A defense against
  certain repeated-header abuses.
- Transport and Server support TLS ALPN over a user-provided `net.Conn`.

### `crypto/tls` and `crypto/x509`

- `Config.Rand` is **deprecated**. For tests, use
  `testing/cryptotest.SetGlobalRandom`.
- New `QUICConfig.ClientHelloInfoConn`.
- Support for `MLKEM1024` key exchange; hybrid post-quantum exchanges can be enabled
  explicitly in `Config.CurvePreferences` even when the `tlsmlkem=0` or
  `tlssecpmlkem=0` GODEBUG settings are in place.
- New `ConnectionState.LocalCertificate` field.
- ML-DSA signatures in TLS 1.3: `MLDSA44`, `MLDSA65`, `MLDSA87`.
- `crypto/x509` parses a wider range of `pkix.Name` fields; it adds
  `RawSignatureAlgorithm` to `Certificate`, `CertificateRequest` and
  `RevocationList`.
- `SystemCertPool` now honors `SSL_CERT_FILE` and `SSL_CERT_DIR` on Windows and
  Darwin as well. If your application runs in an environment where those variables
  are set for another reason, the set of trusted roots may change.
- `pkix.RDNSequence.String` renders unrecognized string attributes as strings
  instead of hex.

### `unicode` 15 to 17

The Unicode table jumps two major versions. Functions such as `unicode.IsLetter` or
`unicode.IsDigit` may classify as letters or digits code points that previously were
not. If you validate identifiers or names with these functions, the accepted input
surface widens.

### `go/types`

A new `Hasher` (implementing `maphash.Hasher`), `HasherIgnoreTags` for the
equivalent of `IdenticalIgnoreTags`, and the `gotypesalias` GODEBUG permanently
removed.

---

## 7. Step-by-step checklist with symptoms

### Step 1 — New toolchain, old `go.mod`

```bash
go install golang.org/dl/go1.27@latest && go1.27 download
go1.27 build ./... && go1.27 test ./...
```

With the `go` directive untouched. Whatever fails here comes from the compiler, the
runtime or the standard library, not from the language version.

**Typical failure**: text differences in JSON errors. → Step 6.
**Typical failure**: `compress/flate` golden files — and also `archive/zip`,
`compress/gzip`, `compress/zlib` and `image/png`, which use flate underneath.
→ Regenerate the goldens.
**Typical failure**: tests inspecting closure names. → See section 4.

### Step 2 — Platforms

```bash
grep -rn "macos-1[0-2]" .github/ .gitlab-ci.yml 2>/dev/null
grep -rn "FROM golang" Dockerfile*
```

Update macOS runners to 13+ and base images.

### Step 3 — Removed GODEBUG settings

```bash
grep -n "godebug" go.mod
grep -rn "//go:debug" --include="*.go" .
grep -rn "GODEBUG" .github/ Makefile Dockerfile* 2>/dev/null
```

Any appearance of the seven settings in section 2 needs analysis, not automatic
deletion. `asynctimerchan` in particular indicates a dependency on asynchronous
timers.

### Step 4 — Raise the directive

```bash
go mod edit -go=1.27
go mod tidy      # separate commit: it reorders the require blocks
go test ./...
```

**Typical failure**: custom traceback parsers. → See goroutine labels, section 3.

### Step 5 — Vet

```bash
go vet ./...
```

The `stdversion` check flags API uses newer than the declared version.

### Step 6 — Isolate JSON

```bash
go test ./... > /tmp/with-v2.txt 2>&1
GOEXPERIMENT=nojsonv2 go test ./... > /tmp/without-v2.txt 2>&1
diff /tmp/with-v2.txt /tmp/without-v2.txt
```

If there are differences, go to `json-v2.md`. Using `nojsonv2` permanently is not an
option: the opt-out is going to disappear.

### Step 7 — Modernize (separate commit)

```bash
go fix ./...
```

Applies the new modernizers (`atomictypes`, `embedlit`, `slicesbackward`,
`unsafefuncs`) on top of the existing ones. Review the diff before accepting it:
`go fix` is conservative but the final judgment is yours. See `language.md`.

---

Source of truth: https://go.dev/doc/go1.27
