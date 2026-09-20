# ditto: a mutation score that mixes "your tests missed this" with "your command cannot see this"

- **Reported by**: autoreas-bridge (private repository, consumer of ditto)
- **ditto version**: `v0.11.0` (`ditto version`)
- **Toolchain**: `go1.27.0 windows/amd64`, Windows 11, MINGW64/Git Bash
- **Date**: 2026-09-19

## Summary

`ditto staged` scopes mutants to the **staged production diff**, but scores them against a
single `--test-command`. When the staged diff spans more than one Go package and the test
command names only some of them, the mutants in the unnamed packages are structurally
unkillable, and the resulting number is reported with the same confidence as a measured score.

We are not asking ditto to slice our work units. We are asking it not to score a situation it
can already recognize as unmeasurable.

## What we ran

The staged change touched five production packages:

```
internal/observability/syncdiag
internal/observability/readcap
internal/mcp/requestcapture
internal/desktop
internal/api/contracts
```

Command:

```bash
ditto staged --exclude-prefix frontend/ --threshold 0.80 \
  --test-command "go test -count=1 -timeout 120s -json ./internal/observability/syncdiag/"
```

Result:

```
Total:       43
Killed:      23
Survived:    20
Score:     0.53 (minimum: 0.80)
2 of the 45 mutants generated never compiled, and are out of the score entirely.
```

The survivor list ditto printed:

```
internal/desktop/app_defaults.go:164:25               -> Comparison Invert
internal/desktop/app_device_sync_diagnostics.go:14:22 -> Comparison Invert
internal/desktop/app_device_sync_diagnostics.go:21:9  -> Comparison Invert
internal/desktop/app_device_sync_diagnostics.go:24:56 -> Integer Decrement
internal/desktop/app_device_sync_diagnostics.go:24:56 -> Integer Increment
internal/desktop/app_device_sync_diagnostics.go:26:3  -> Range Break
internal/desktop/app_runtime_services.go:110:22       -> Comparison Invert
internal/desktop/app_runtime_services.go:110:43       -> Comparison Invert
internal/desktop/app_runtime_services.go:110:73       -> Comparison Invert
internal/desktop/app_runtime_services.go:114:40       -> Comparison Invert
internal/desktop/app_runtime_services.go:114:65       -> Comparison Invert
internal/desktop/app_runtime_services.go:110:5        -> Comparison Replace
internal/desktop/app_runtime_services.go:110:53       -> Comparison Replace
internal/desktop/app_runtime_services.go:110:5        -> Comparison Replace
internal/desktop/app_runtime_services.go:110:32       -> Comparison Replace
internal/desktop/app_runtime_services.go:114:30       -> Comparison Replace
internal/desktop/app_runtime_services.go:114:50       -> Comparison Replace
internal/observability/syncdiag/reader.go:132:5       -> Comparison Replace
internal/observability/syncdiag/reader.go:169:14      -> Integer Increment
internal/observability/syncdiag/reader.go:172:12      -> Comparison
```

**17 of the 20 survivors are in `internal/desktop/`, a package the supplied test command never
executes.** No test we could write inside `internal/observability/syncdiag` can kill them. Even
if we had killed every killable survivor that run could reach, the score could not have exceeded
roughly `26/43 = 0.605`.

The same staged set, with every owning package named in the test command, then reported:

```
Total:       16
Killed:      16
Survived:     0
Score:     1.00 (minimum: 0.80)
```

The two totals differ because the first run still had `internal/observability/syncdiag` staged
while the second had already committed it. That is the point: the *scope* is the index, not the
question the score appears to answer.

## Why this misleads, rather than merely annoys

The number looks like a coverage verdict. It is partly an arithmetic artifact of the scope, and
nothing in the output distinguishes the two:

- A mutant that survived because a test asserted the wrong thing.
- A mutant that survived because the command cannot reach its package.

Three natural responses, all wrong:

1. Write tests for the unreachable mutants. Impossible inside the named package, and impossible
   in general without widening the command.
2. Lower `--threshold`. Makes the unmeasurable number "pass".
3. Conclude the change is under-tested. It may be perfectly tested.

The correct response — re-slice the work unit, or name every owning package in the command — is
exactly the one the output hides.

This is the same error class as reporting `0` from a failed read: **a low score from an
unexecutable mutation set is not a measured score.**

## What ditto already gets right

Worth stating, because it is why this case stands out as a remaining hole rather than a pattern:

- **Build failure is not scored.** Staging one package while a needed new file stayed out of the
  index produced `[build failed]` and no score. That is the correct treatment for the dependency
  case, and it is the honest failure mode.
- **Non-compiling mutants are excluded from the denominator**, and said so: "N mutants generated
  never compiled, and are out of the score entirely".
- **The mutation scope is already printed per file** (`internal/desktop/app_runtime_services.go —
  11 mutants`), which is precisely the information needed to detect the mismatch.
- **The command's cost is measured and stated**: `baseline: the suite took 6.88s on unmutated
  code, and every mutant runs it again.`
- `staged` materialising the index and announcing generated-path copies is an explicit, honest
  model. The generated-path behaviour in `.ditto.json` is documented where a user will find it.

So ditto already knows the mutants' files, the command, and the command's cost. It has everything
needed to notice that the command cannot execute the packages that own 17 of them.

## What we already knew, and what we are actually reporting

Our own test reference documents the workaround and we should have followed it: a staged scope
spanning two packages under one package's test command marks every mutant in the other as
surviving, and it recorded the same shape of damage earlier (0.63 reported against real scores of
0.90 and 1.00), with the remedy "name the package in the test command and `--exclude-prefix` the
others".

So this is not a bug we found in ditto's scoping logic. It is a report about what ditto *prints*
when the situation occurs: the workaround is ours to apply, and the tool is the place where the
situation is visible or not. Everything below is therefore about detection and disclosure, not
about ditto choosing our scope for us.

## Suggested behaviour, from cheap to expansive

1. **Detect and declare (minimal).** Derive the owning package set from the mutated files, and
   compare it with the `--test-command`. If some mutants live in packages the command does not
   execute, say so explicitly instead of, or beside, the score:

   > 17 mutants are in packages this test command does not execute
   > (`internal/desktop`). Their survival cannot be attributed to it.

   A distinct non-zero exit code for "unmeasurable" would let a wrapper tell that condition apart
   from "below threshold". Today both are `1`.

2. **Offer scope narrowing.** An `--include-prefix` mirror of `--exclude-prefix`, so one honest
   pass per owning package is expressible without rewriting the command per run.

3. **Per-package runs (opt-in).** Group mutants by owning package and derive one test command per
   group. We are **not** asking for this as a default: the `-h` text is explicit that the command
   runs once per mutant, and changing that cost model silently would be worse than the current
   behaviour. As an opt-in mode it would be genuinely useful.

## What is not ditto's jurisdiction

Work-unit granularity is a repository policy question. Our own policy says "stage the production
change and run mutation testing against its owning package" — the same single-owner assumption
`ditto staged -h` makes when it advises "name the package that owns the change instead".

Our defect was bundling five packages into one staged change. ditto cannot decide our slicing for
us, and we are not proposing that it try. The request is narrower: **when the tool can see that
the score is not measurable, it should not present it as though it were.**

## Cost to us

Three tool round-trips and roughly forty minutes spent on a number that was not measuring what it
appeared to measure, including one attempt to "fix" the score by staging packages one at a time,
which failed to build for an unrelated and correctly-reported reason.
