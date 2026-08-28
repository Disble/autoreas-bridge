# The Go 1.27 standard library: what is new and when to use it

Contents:

1. [New packages](#1-new-packages)
2. [Testing](#2-testing)
3. [Concurrency and diagnostics](#3-concurrency-and-diagnostics)
4. [Strings, bytes and numbers](#4-strings-bytes-and-numbers)
5. [Networking and HTTP](#5-networking-and-http)
6. [Cryptography](#6-cryptography)
7. [Database](#7-database)
8. [Hashing and type tooling](#8-hashing-and-type-tooling)
9. [Experimental: SIMD](#9-experimental-simd)
10. [Summary table](#10-summary-table)

---

## 1. New packages

### `uuid` — UUIDs in the standard library

Generates and parses RFC 9562 compliant UUIDs, with a cryptographically secure
random source.

```go
import "uuid"

id := uuid.NewV4()              // random, 122 bits of entropy
sortable := uuid.NewV7()        // timestamp in the high 48 bits
generic := uuid.New()           // algorithm appropriate for general use

parsed, err := uuid.Parse("f81d4fae-7dec-11d0-a765-00a0c91e6bf6")
fixed := uuid.MustParse("f81d4fae-7dec-11d0-a765-00a0c91e6bf6")  // panics if invalid

empty := uuid.Nil()             // 00000000-0000-0000-0000-000000000000
top := uuid.Max()               // ffffffff-ffff-ffff-ffff-ffffffffffff
```

The `UUID` type is a 16-byte array with `String`, `Compare`, `MarshalText`,
`AppendText` and `UnmarshalText` — meaning it serializes itself in JSON and any
text-based format, and it is directly comparable and sortable.

**When `NewV7` matters**: v4 UUIDs are random, which produces scattered inserts into
B-tree indexes and fragmentation in databases. v7 puts the timestamp first, so they
sort chronologically and inserts are localized. For primary keys, v7 is almost
always the better choice; v4 when the ordering must not leak temporal information.

In code review: if the project depends on `github.com/google/uuid` only for this,
the dependency is now optional. The migration is straightforward but the function
names differ, so it is not a simple import swap.

### `crypto/mldsa` — post-quantum signatures

Implements the ML-DSA signature scheme (FIPS 204), the NIST standardization of
Dilithium. Integrated into the rest of the stack:

- `crypto/x509` supports ML-DSA private keys, public keys and signatures.
- `crypto/tls` supports ML-DSA in TLS 1.3 via the `MLDSA44`, `MLDSA65` and `MLDSA87`
  `SignatureScheme` values.
- `crypto` adds the `MLDSAMu` `Hash` value, for signing with an external mu.

Context for advising well: the real urgency of post-quantum signatures is lower than
that of key exchange. An attacker can record traffic today and decrypt it once they
have a quantum computer ("harvest now, decrypt later"), which makes hybrid key
exchange urgent (`MLKEM1024` and the `crypto/tls` hybrids). Signatures, by contrast,
only have to be broken in the moment — a signature forged in 2040 does not compromise
a session from 2026. Adopting ML-DSA is sensible for long-lived certificates and for
compliance requirements, not as an emergency.

---

## 2. Testing

### `httptest.NewTestServer`

Creates a test server over a **fake in-memory network**, with no real TCP listener.

```go
func TestAPI(t *testing.T) {
    h := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "hello")
    })
    srv := httptest.NewTestServer(t, h)

    resp, err := srv.Client().Get(srv.URL)
    // ...
}
```

The signature is `NewTestServer(t testing.TB, handler http.Handler) *Server`, so it
works equally in tests, benchmarks and fuzzing, and it cleans itself up at the end.

The motivation given in the official notes is that it be **usable alongside
`testing/synctest`**: a real TCP listener introduces real I/O, which breaks the
simulated-time bubble of synctest. With the in-memory network, an HTTP client test
with timeouts and retries can run inside `synctest.Test` and be deterministic and
instantaneous. As a side effect there are no real ports to manage either.

### `synctest.Sleep`

Combines `time.Sleep` with `synctest.Wait` in a single call: it advances the fake
clock **and** waits for the goroutines to settle.

```go
synctest.Test(t, func(t *testing.T) {
    start := time.Now()
    go func() {
        time.Sleep(time.Second)
        // ...
    }()
    synctest.Sleep(2 * time.Second)   // instantaneous in real time
    fmt.Println(time.Since(start))    // 2s of simulated time
})
```

This is what replaces the `time.Sleep(100 * time.Millisecond)` calls scattered
through concurrency tests. Those sleeps are the number one cause of flaky tests: if
the CI machine is slow, they fail; if you lengthen them "to be safe", the suite takes
minutes. `synctest` removes the problem at the root because time is simulated — the
tests are deterministic *and* instantaneous.

### `testing/cryptotest.SetGlobalRandom`

The supported way to control randomness in cryptography tests, now that
`tls.Config.Rand` is deprecated.

---

## 3. Concurrency and diagnostics

### `goroutineleak` profile (stable)

Detects goroutines permanently blocked on concurrency primitives, using the GC
reachability analysis.

```go
pprof.Lookup("goroutineleak").WriteTo(w, 1)
```

Or, by importing `net/http/pprof`, at `/debug/pprof/goroutineleak`.

It does not detect leaks involving global variables, nor those depending on local
variables of runnable goroutines. It is a high-value tool, not a proof that there
are no leaks.

### Goroutine labels in tracebacks

In `go 1.27`+ modules, traceback headers include `runtime/pprof` labels. If you tag
goroutines with the request ID on entering the handler, production panics start
telling you which request it was.

```go
ctx := pprof.WithLabels(r.Context(), pprof.Labels("request_id", id))
pprof.SetGoroutineLabels(ctx)
```

Can be turned off with `GODEBUG=tracebacklabels=0`.

### `runtime/secret`

Goroutines created inside secret mode now run in secret mode as well — the property
is inherited, which is what one would expect and what makes the function usable in
concurrent code.

---

## 4. Strings, bytes and numbers

### `strings.CutLast` and `bytes.CutLast`

They complement `Cut`, but from the end.

```go
before, after, ok := strings.CutLast("a/b/c", "/")
// "a/b", "c", true

before, after, ok = strings.CutLast("nosep", "/")
// "nosep", "", false
```

It replaces the `strings.LastIndex` plus manual slicing pattern, where off-by-one
errors and forgetting to check for `-1` are classics. Natural cases: splitting
directory and file name, extracting an extension, splitting `host:port`, or keeping
the last segment of a qualified identifier.

### `math/big`: `Divide` with rounding modes

`(*Int).Divide` computes quotient **and** remainder with an explicit rounding mode:

```go
// func (z *Int) Divide(x, y, r *Int, mode RoundingMode) *Int
q, r := new(big.Int), new(big.Int)

q.Divide(a, b, r, big.Trunc)   // toward zero
q.Divide(a, b, r, big.Floor)   // toward -infinity
q.Divide(a, b, r, big.Round)   // to nearest
q.Divide(a, b, r, big.Ceil)    // toward +infinity
```

The fourth argument is mandatory: `Divide` leaves the remainder in `r`. It is easy
to forget because `Quo`/`Div` do not ask for it in their usual form.

It solves the real problem that `Quo` truncates and `Div` does Euclidean division,
which forced you to correct the remainder by hand to get the rounding you wanted — a
common source of bugs in monetary and accounting calculations.

### `math/rand/v2`: generic method `N`

`(*Rand).N[Int intType](Int) Int` — the method version of the `rand.N` function, now
possible thanks to generic methods. It returns a value in `[0, n)` honoring the
integer type you pass it.

### `unicode` 15 to 17

A two-major-version jump. `IsLetter`, `IsDigit` and friends may now classify code
points they previously did not recognize. Relevant if you validate identifiers,
usernames or text input with these functions: the set of accepted inputs widens.

---

## 5. Networking and HTTP

### `net/url`: `Clone`

```go
u2 := u.Clone()          // deep copy of *url.URL
v2 := values.Clone()     // deep copy of url.Values
```

Copying a `*url.URL` with `*u2 = *u` shares the `Userinfo` pointer, and `Values`
share the underlying map. `Clone` does the right thing. If you see manual URL copies
in a code review, this is what should be used instead.

### `net/http`

- **`Server.MaxHeaderValueCount`** and the `DefaultMaxHeaderValueCount` constant
  (500): limits how many values a single header can have. A useful hardening on
  internet-facing servers.
- **RFC 9218 client priority in HTTP/2**: accepted by default; opt out with
  `Server.DisableClientPriority`.
- **Automatic response body draining in HTTP/1**: improves connection reuse without
  the code having to remember to drain the body.
- **ALPN over a user-provided `net.Conn`**: supported in Transport and Server.

### `net`

`UnixConn` returns `io.EOF` directly from its read methods, without wrapping it in a
`*net.OpError`. Use `errors.Is(err, io.EOF)`, which works in both cases.

---

## 6. Cryptography

In addition to `crypto/mldsa` (section 1):

- **`crypto/tls`**: `MLKEM1024` key exchange; hybrid post-quantum exchanges can be
  enabled explicitly in `Config.CurvePreferences` even when the `tlsmlkem=0` or
  `tlssecpmlkem=0` GODEBUG settings are in place; new
  `QUICConfig.ClientHelloInfoConn`; new `ConnectionState.LocalCertificate` field;
  `Config.Rand` **deprecated** in favor of `testing/cryptotest.SetGlobalRandom`.
- **`crypto/ecdsa`**: `PrivateKey.Sign` validates the hash length when it receives
  non-nil `SignerOpts`. This is a behavior change: see `migration.md`.
- **`crypto/x509`**: wider parsing of `pkix.Name` fields; new
  `RawSignatureAlgorithm` fields in `Certificate`, `CertificateRequest` and
  `RevocationList`; `SystemCertPool` honors `SSL_CERT_FILE` and `SSL_CERT_DIR` on
  Windows and Darwin too.
- **`crypto/x509/pkix`**: `RDNSequence.String` renders unrecognized string-typed
  attributes as strings instead of encoding them in hex.
- **`crypto`**: new `MLDSAMu` `Hash` value.

---

## 7. Database

- **`database/sql.ConvertAssign`**: publicly exposes the value conversion the package
  used internally. Useful when writing data access layers or `sql.Scanner`
  implementations that need the same conversion semantics as the rest of the package.
- **`database/sql/driver.RowsColumnScanner`**: lets a driver scan directly into the
  destination, skipping the intermediate conversion. Relevant to driver authors, not
  to users of `database/sql`.

---

## 8. Hashing and type tooling

- **`hash/maphash`**: new `Hasher` interface and `ComparableHasher` type. It allows
  defining custom hashing for comparable types, the missing piece for building your
  own maps and sets with controlled hashing.
- **`go/types`**: new `Hasher` type (implementing `maphash.Hasher`) and
  `HasherIgnoreTags` (the equivalent of `IdenticalIgnoreTags`). The `gotypesalias`
  GODEBUG is permanently removed.
- **`go/constant.StringLen`**: the length of a string without building the full
  `Value` — it matters in analysis tools processing a lot of code.
- **`go/scanner`**: new `Scanner.End()` method for the end position of a token.
- **`go/token`**: `File` now has a `String()` method.
- **`syscall`** (Plan 9): the `Errno` type is now defined and implements `error`.

---

## 9. Experimental: SIMD

Requires `GOEXPERIMENT=simd` at build time. **The API is not stable.**

- **`simd`**: portable vector types of unspecified size (`Int8s`, `Float32s`, ...)
  with operations agnostic to vector width. Available on every architecture; it uses
  hardware instructions where they exist. It is a scalable subset of the
  `simd/archsimd` operations.
- **`simd/archsimd`**: architecture-specific API. In 1.27 the amd64 API is revised
  and support is added for 128-bit Neon on arm64 and 128-bit SIMD on WebAssembly.
  128-bit vectors on wasm/arm64/amd64; 256 and 512 bits on some amd64.

Recommendation when advising: do not take this to production. The API is going to
change and the code will have to be rewritten. For experimenting or measuring the
performance ceiling of a numeric kernel, go ahead.

---

## 10. Summary table

| Package | Addition | What for |
|---|---|---|
| `uuid` | `NewV4`, `NewV7`, `Parse`, `MustParse`, `Nil`, `Max` | UUIDs with no external dependencies |
| `crypto/mldsa` | ML-DSA signatures (FIPS 204) | Post-quantum signatures |
| `strings`, `bytes` | `CutLast` | Splitting on the last separator |
| `net/url` | `URL.Clone`, `Values.Clone` | Correct deep copy |
| `net/http` | `Server.MaxHeaderValueCount` | Cap on repeated headers |
| `net/http/httptest` | `NewTestServer` | In-memory test server |
| `testing/synctest` | `Sleep` | Deterministic concurrency tests |
| `math/big` | `Divide` with rounding modes | Explicit rounding |
| `math/rand/v2` | Generic method `N` | Typed randomness |
| `hash/maphash` | `Hasher`, `ComparableHasher` | Custom hashing |
| `database/sql` | `ConvertAssign` | Exposed value conversion |
| `runtime/pprof` | `goroutineleak` profile | Goroutine leak detection |
| `simd`, `simd/archsimd` | Vectors (experimental) | Portable and per-architecture SIMD |

---

Source of truth: https://go.dev/doc/go1.27. For exact signatures, `go doc <package>`
or `pkg.go.dev` — reconstructing a signature from memory is the easiest way to give a
confident wrong answer.
