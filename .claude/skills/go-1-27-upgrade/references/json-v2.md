# `encoding/json` on v2, `encoding/json/v2` and `jsontext`

The largest change in Go 1.27 in terms of risk surface. Contents:

1. [The idea in one sentence](#1-the-idea-in-one-sentence)
2. [What changes if you touch nothing](#2-what-changes-if-you-touch-nothing)
3. [Default differences between v1 and v2](#3-default-differences-between-v1-and-v2)
4. [The v2 API](#4-the-v2-api)
5. [Options: the configuration mechanism](#5-options-the-configuration-mechanism)
6. [Struct tags in v2](#6-struct-tags-in-v2)
7. [`jsontext`: the syntactic level](#7-jsontext-the-syntactic-level)
8. [Changes since the GOEXPERIMENT period](#8-changes-since-the-goexperiment-period)
9. [How to decide whether to migrate](#9-how-to-decide-whether-to-migrate)

---

## 1. The idea in one sentence

`encoding/json` keeps its API and its behavior, but underneath it now runs the
`encoding/json/v2` engine, which applies v1 semantics through compatibility layers.
The new API exists in parallel for whoever wants it, and there is no obligation to
migrate.

## 2. What changes if you touch nothing

Very little, and that is intentional. The official notes say it explicitly:
marshaling and unmarshaling behavior is preserved; what may differ is **the exact
text of error messages**.

Practical consequence: tests doing `if err.Error() != "json: cannot unmarshal ..."`
may fail. This is the most likely thing you will hit when upgrading, and the correct
fix is not to adapt the string but to check the error type or condition — stdlib
error text was never part of the contract.

On performance: the official notes report parity on marshal and a significant
improvement on unmarshal. Third-party measurements show results that vary quite a
bit depending on data shape (structs vs `map[string]any`, size, nesting). If JSON
performance matters in your service, measure your real workload with
`go test -bench` instead of assuming either figure.

Emergency escape hatch: `GOEXPERIMENT=nojsonv2` at build time restores the original
v1 implementation. It is meant to unblock a release, not to stay: it is expected to
be removed in a future version.

## 3. Default differences between v1 and v2

This **only applies if you import `encoding/json/v2` directly**. If you keep using
`encoding/json`, v1 semantics are preserved.

| Aspect | v1 (`encoding/json`) | v2 (`encoding/json/v2`) |
|---|---|---|
| Duplicate member names in an object | Accepts, last one wins | **Rejects** |
| Invalid UTF-8 in strings | Replaces it with U+FFFD | **Rejects** |
| Field name matching | Case-insensitive | **Case-sensitive** |
| Map key ordering when serializing | Always sorted | No guaranteed order |
| Nil slice/map when serializing | `null` | `[]` / `{}` |

The first two are security hardenings: parsers that differ in how they treat
duplicate keys or invalid UTF-8 have been the origin of real cross-system confusion
vulnerabilities. v2 follows RFC 7493 (I-JSON) by default.

The last two rows are the ones that surprise people migrating existing code: an
endpoint that returned `"items": null` now returns `"items": []`, and output that
was byte-stable stops being so.

Each of these differences has an `Option` to restore it, and `json.DefaultOptionsV1()`
exists in the v1 package to recover the full set of v1 semantics when calling v2
functions.

## 4. The v2 API

Six functions instead of two, covering bytes, streams and tokens, and all of them
accept variadic `Options`:

```go
import jsonv2 "encoding/json/v2"

jsonv2.Marshal(v any, opts ...Options) ([]byte, error)
jsonv2.MarshalWrite(w io.Writer, v any, opts ...Options) error
jsonv2.MarshalEncode(e *jsontext.Encoder, v any, opts ...Options) error

jsonv2.Unmarshal(b []byte, v any, opts ...Options) error
jsonv2.UnmarshalRead(r io.Reader, v any, opts ...Options) error
jsonv2.UnmarshalDecode(d *jsontext.Decoder, v any, opts ...Options) error
```

`MarshalWrite`/`UnmarshalRead` replace `json.NewEncoder(w).Encode(v)` and
`json.NewDecoder(r).Decode(&v)` more directly, without building an intermediate
object.

### Customization interfaces

Alongside the classic ones, v2 adds variants that work directly on the
encoder/decoder and avoid materializing intermediate `[]byte`:

```go
type Marshaler       interface{ MarshalJSON() ([]byte, error) }
type MarshalerTo     interface{ MarshalJSONTo(*jsontext.Encoder) error }
type Unmarshaler     interface{ UnmarshalJSON([]byte) error }
type UnmarshalerFrom interface{ UnmarshalJSONFrom(*jsontext.Decoder) error }
```

Implementing `MarshalerTo`/`UnmarshalerFrom` on hot types is where the big
performance gains are: it removes a full round of allocation and re-parsing per
value.

### Per-type serializers, without touching the type

A capability v1 did not have: registering how to serialize a type you do not control
(from a dependency, or `time.Time` in a different format) without wrapping it.

```go
opts := jsonv2.WithMarshalers(jsonv2.MarshalFunc(func(t time.Time) ([]byte, error) {
    return []byte(strconv.FormatInt(t.Unix(), 10)), nil
}))
b, err := jsonv2.Marshal(event, opts)
```

And its companions: `MarshalToFunc`, `UnmarshalFunc`, `UnmarshalFromFunc`,
`JoinMarshalers`, `JoinUnmarshalers`.

## 5. Options: the configuration mechanism

Options are composable values passed to any call:

| Option | What for |
|---|---|
| `DefaultOptionsV2()` | The v2 default set |
| `StringifyNumbers(bool)` | Numbers as JSON strings |
| `Deterministic(bool)` | Stable output (sorts map keys) |
| `FormatNilSliceAsNull(bool)` | Nil slice to `null` instead of `[]` |
| `FormatNilMapAsNull(bool)` | Nil map to `null` instead of `{}` |
| `OmitZeroStructFields(bool)` | Omit struct fields at their zero value |
| `MatchCaseInsensitiveNames(bool)` | Case-insensitive matching |
| `RejectUnknownMembers(bool)` | Error on unknown members |
| `WithMarshalers(*Marshalers)` | Per-type serializers |
| `WithUnmarshalers(*Unmarshalers)` | Per-type deserializers |

They combine with `JoinOptions` and are inspected with `GetOption`:

```go
// Strict v2, additionally rejecting unknown fields
opts := jsonv2.JoinOptions(
    jsonv2.DefaultOptionsV2(),
    jsonv2.RejectUnknownMembers(true),
)

// v2, but with deterministic output for tests or signatures
opts := jsonv2.JoinOptions(jsonv2.DefaultOptionsV2(), jsonv2.Deterministic(true))
```

`Deterministic(true)` is the option you need if you generate JSON that is later
signed, hashed or compared in a test. In v1 map key ordering was guaranteed; in v2
you have to ask for it.

## 6. Struct tags in v2

```go
type User struct {
    ID    string   `json:"id"`
    Name  string   `json:"name,omitzero"`
    Meta  Metadata `json:",embed"`
    Score int      `json:"score,string"`
    Email string   `json:"email,case:ignore"`
}
```

- `omitzero` — omits the field if it is at its zero value. This is the option most
  people actually wanted when they wrote `omitempty`.
- `omitempty` — omits the field if its JSON representation is empty.
- `embed` — promotes the fields of a nested struct into the parent object. **It was
  called `inline` during the experimental period**; if you see `inline` in code or a
  blog post, it is outdated.
- `string` — applies `StringifyNumbers` to that field.
- `case:ignore` / `case:strict` — per-field control of name matching.

The `format:` and `unknown` tags **do not exist** in the final version; they were
removed before release.

## 7. `jsontext`: the syntactic level

`encoding/json/jsontext` separates JSON syntax from Go semantics. It works with
`Token` and `Value` through an `Encoder` and a `Decoder` that maintain the valid
JSON state machine.

It is the right tool when you want to walk or transform JSON without knowing its
shape: rewriting a field inside a large document without deserializing all of it,
validating streams, or implementing `MarshalerTo` for a type.

Migration note: the numeric accessors on `Token` now also return an error, a change
made during the experimental period.

## 8. Changes since the GOEXPERIMENT period

If the project already used `GOEXPERIMENT=jsonv2` before 1.27, there is a concrete
list of breaks between that version and the final one:

- The `format` tag was removed
- The `unknown` tag was removed
- The `DiscardUnknownMembers` marshal option was removed
- The `SkipFunc` sentinel error was removed
- The `inline` tag was renamed to `embed`
- The behavior of the `string` tag changed
- The behavior of the `MatchCaseInsensitiveNames` option changed
- In `jsontext`, the numeric accessors on `Token` return an error alongside the value

## 9. How to decide whether to migrate

Not migrating is a perfectly valid decision and the default one. `encoding/json`
will remain supported and there is no pressure to move.

Migrating to v2 makes sense when:

- **You are parsing JSON from untrusted sources** and rejecting duplicates and
  invalid UTF-8 matters to you as a security property.
- **Unmarshal is a measured bottleneck** and you can implement `UnmarshalerFrom` on
  the hot types.
- **You need to configure serialization for types you do not control** without
  wrapping them.
- **You want `omitzero`** instead of fighting the quirks of `omitempty`.

And it does not make sense when your application JSON is plumbing detail that works
fine. In that case the migration work only introduces risk.

### If you migrate, do it in pieces

Migrating package by package is safe: v1 and v2 coexist in the same binary. A
comfortable pattern is to start by calling v2 with v1 semantics and harden
afterwards:

```go
import (
    jsonv1 "encoding/json"
    jsonv2 "encoding/json/v2"
)

// Step 1: v2 API, behavior identical to before.
err := jsonv2.Unmarshal(data, &v, jsonv1.DefaultOptionsV1())

// Step 2: v2 defaults, with the tests already green.
err = jsonv2.Unmarshal(data, &v)
```

When hardening, the two changes that break outward-facing API contracts the most are
nil slices/maps (`null` to `[]`/`{}`) and case sensitivity in names. Review the
consumers before dropping v2 defaults on a public endpoint.

---

Source of truth: https://go.dev/doc/go1.27 and the package documentation on
`pkg.go.dev`. For an exact signature, check `go doc encoding/json/v2`.
