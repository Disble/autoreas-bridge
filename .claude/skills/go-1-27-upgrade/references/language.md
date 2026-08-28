# Go 1.27 language changes and modernization with `go fix`

Contents:

1. [Generic methods](#1-generic-methods)
2. [Field selectors in struct literals](#2-field-selectors-in-struct-literals)
3. [Generalized type inference](#3-generalized-type-inference)
4. [The `go fix` modernizers](#4-the-go-fix-modernizers)
5. [When NOT to adopt the new things](#5-when-not-to-adopt-the-new-things)

---

## 1. Generic methods

As of 1.27, **a method declaration may declare its own type parameters**,
independent of the receiver ones. This ends a limitation that had existed since
generics landed in 1.18.

```go
type List[E any] []E

// The method declares F, which has nothing to do with E.
func (l List[E]) Apply[F any](f func(E) F) List[F] {
    r := make(List[F], len(l))
    for i, x := range l {
        r[i] = f(x)
    }
    return r
}
```

The receiver does not even need to be generic:

```go
type Bag struct{ items []any }

func (b *Bag) Add[T any](v T) { b.items = append(b.items, v) }
```

The standard library uses it right away: `math/rand/v2` adds the generic method
`(*Rand).N[Int intType](Int) Int`.

### The two restrictions that define the real scope

These are not minor details; they determine what can be redesigned and what cannot.

1. **Interface methods cannot declare type parameters.** Interfaces remain
   non-generic in their methods.
2. **A generic method cannot implement an interface method.** A method
   `Add[T any](T) T` does not satisfy an interface asking for `Add(int) int`.

The reason is structural: a generic method has infinitely many possible
instantiations, and an interface method table has to be finite and known at compile
time. That is why generic methods work only on concrete types; anything relying on
dynamic dispatch still needs package-level functions.

### When to turn a function into a generic method

The useful question is not "can I?" but "does it read better?". A generic method
wins when the operation conceptually belongs to the type and chaining it reads
better than nesting calls:

```go
// Before: the operation lives outside the type and nests when chained.
labels := Map(Map(nums, double), format)

// After: the operation belongs to the type and chains.
labels := nums.Apply(double).Apply(format)
```

It loses when the type has to satisfy an interface — restriction 2 blocks you there
— or when the operation is genuinely independent of the receiver type. In that case
a package function is still the right thing, and there is nothing outdated about it.

A warning about the refactoring impulse: converting existing helpers into generic
methods is a public API change. It is worth it in new code or in internal packages,
rarely in a published library purely for elegance.

## 2. Field selectors in struct literals

The official notes put it this way: *"a key in a struct literal may now be any field
selector valid for the struct type, not just a (top-level) field name"*.

The case this solves, by far the most common one, is promoted fields from embedded
structs:

```go
type Base struct{ ID int }

type User struct {
    Base
    Name string
}

// Before 1.27:
u := User{Base: Base{ID: 7}, Name: "Ana"}

// As of 1.27:
u := User{ID: 7, Name: "Ana"}
```

This is a notable readability improvement in hierarchies with two or three levels of
embedding, where the literal used to become a matryoshka of nested constructors that
hid the actual data.

Things to keep in mind:

- You cannot initialize both the whole embedded field and its promoted fields in the
  same literal — that would give two sources of truth for the same data.
- Pointer embedding does not work here: there is nothing to point at yet, so the
  compiler rejects the implicit indirection.

If you need the exact rule for an unusual case (for example, whether a key can be a
dotted qualified selector), check the specification at
https://tip.golang.org/ref/spec#Composite_literals before asserting anything — it is
an easy detail to get wrong.

The `embedlit` modernizer in `go fix` rewrites literals to the new style
automatically.

## 3. Generalized type inference

Function type inference now applies **in every context** where a generic function is
assigned to (or converted to) a compatible function type. Previously there were
contexts where inference did not apply and you had to instantiate by hand —
typically composite literals and channel sends, although the notes do not enumerate
the exact list of contexts that failed.

```go
func double[T ~int | ~float64](v T) T { return v * 2 }

type S struct{ f func(int) int }

s := S{f: double}                   // before: double[int]
c := make(chan func(int) int, 1)
c <- double                         // before: double[int]
```

The cumulative effect is that a lot of explicit `[T]` noise scattered through the
code disappears, especially in handler registries and function tables.

Watch out for backward compatibility: writing code that relies on this inference
makes the module require `go 1.27`. If you maintain a library supporting older
versions, explicit `[T]` is still the right call.

## 4. The `go fix` modernizers

`go fix ./...` applies automatic rewrites. In 1.27 the set changes:

**New:**

- `atomictypes` — modernizes `sync/atomic` usage toward the atomic types
  (`atomic.Int64`, `atomic.Bool`, ...) instead of the standalone functions over
  plain variables. The types make it impossible to accidentally access the same
  variable with and without atomicity.
- `embedlit` — rewrites struct literals to use promoted field names (section 2).
- `slicesbackward` — replaces manual reverse iteration loops with the
  `slices.Backward` iterator.
- `unsafefuncs` — replaces manual pointer arithmetic with function calls:
  `unsafe.Pointer(uintptr(p) + uintptr(n))` becomes `unsafe.Add(p, n)`. The form
  with an intermediate `uintptr` is fragile because the GC can move the object
  between the conversion and the use; `unsafe.Add` does not have that hole.

**Renamed:** `waitgroup` becomes `waitgroupgo` (to avoid ambiguity). It converts the
`wg.Add(1)` plus `go func(){ defer wg.Done(); ... }()` pattern into `wg.Go(...)`.

**Removed:** `fmtappendf`, for stylistic reasons.

How to use it well:

```bash
go fix ./...
git diff        # review before accepting
```

`go fix` is conservative, but it is a bulk rewriting tool and it deserves a real
review, not a `git commit -a`. And for the same reason as in the migration: do it in
its own commit, separate from any functional change. If a regression shows up later,
you want to be able to revert the modernization without losing anything else.

## 5. When NOT to adopt the new things

There is a predictable temptation when reading a list of new features: rewriting
code that works. Some legitimate reasons not to:

- **The module declares an older Go version.** Using 1.27 syntax forces you to raise
  the `go` directive, which in turn forces every consumer of the module to have a
  1.27+ toolchain. In a public library that is a compatibility decision, not a style
  one.
- **The type participates in interfaces.** Generic methods do not satisfy them.
- **The change is purely cosmetic in stable code.** Every line touched is a line to
  review and a `git blame` entry lost.

The reasonable rule: apply the new things in code you are writing or modifying
anyway, and leave working code alone unless `go fix` changes it mechanically and
verifiably.

---

Source of truth: https://go.dev/doc/go1.27 and https://tip.golang.org/ref/spec
