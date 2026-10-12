# Episode identity triage and long-duration finding

> **Proposal / not implemented.** This document specifies a *proposed* pipeline and output contract (inputs, rules, categories, thresholds). None of it exists in Bridge today. Current Bridge facts quoted here (cursor behavior, retained events, the local study) are documented observations, not part of the proposal. Every numeric setting is an uncalibrated example, never a user-approved or runtime default.

**Paired artifacts:** [interactive diagram (HTML)](episode-identity-triage.html) · [diagram source (JSON)](episode-identity-triage.diagram.json). The diagram summarizes the *same* rules; step IDs (`S1`–`S6`, `D1`–`D3`, `X1`) match. Step IDs, not node colors, are normative.

## 1. Quick path

Two **independent** findings are derived from one observation of the anime folder:

| Finding | Steps | Output per file | Needs an episode number? |
|---|---|---|---|
| **Identity**: which ordinary episode a file *probably* holds | S1 → S2 → S3 → S4 → S5 → S6 (abstention X1) | one categorical verdict with reasons and candidates | it *is* the number |
| **Duration**: is the file unusually long | S1 → D1 → D2 → D3 | `LONG`, `NOT_LONG` or `UNAVAILABLE` | no |

Design stance:

- **Hierarchical audit, not a score.** Ordered rules, first match wins. No probabilities, no additive weights, no independence assumption.
- **Abstain over guess.** Conflicts, duplicates, ranges, ties and insufficient evidence give `UNRESOLVED` with the candidate set; no filename tiebreak ever chooses.
- **Guarantees end at the observation.** The filesystem is external and mutable; a verdict describes what was observed under stated assumptions, not true content.
- **Read-only.** Nothing is written, renamed, corrected or blocked.

## 2. Scope and non-goals

| In scope | Out of scope |
|---|---|
| Direct (non-recursive) children of the configured anime folder | Recursive scans, nested season folders |
| Filename labels, folder count, mutable timestamps, optional retained Bridge events | Playback observation, download-origin requirement, permanent per-file lifecycle tracking |
| Container-reported duration in seconds | Stream/codec metadata, content fingerprints |
| Anime-level notice "a file here is unusually long" | Claiming which episode was played next |

Copied or externally added files and rewatches are first-class; absent history is **neutral**, never negative.

## 3. Assumptions

| ID | Assumption | If it fails |
|---|---|---|
| A1 | **Observation boundary.** Enumeration is not an atomic global snapshot; entries may change between listing and measurement. | Per-entry `stability` and listing `status` gate the rules (§5.4, §5.5). |
| A2 | **Convention K** (asserted by `P.assumeK`, never proven): one ordinary video per episode, numbering starts at 1, no gaps, no duplicates, no extras. | No `HIGH_CONTEXTUAL`, no `LOW`; labels are still audited. |
| A3 | **A_rank** (asserted by `P.assumeRank`, requires K): ordinary episodes were created/modified in episode order, starting at 1. | No rank hypothesis is produced. |
| A4 | `birth` and `mtime` are **separate mutable timelines**, not independent votes. Copies, restores and re-encodes may reorder them. | Chronology is a diagnostic, never a veto. |
| A5 | **Cursor lineage.** Filename label, folder count and Bridge events share one cursor assumption (`planned = max(highest, count) + 1`; `downloaded` = the same planned number plus a count advance). | They form one lineage and are never counted as independent confirmations. |
| A6 | Container-reported seconds measure the file, not its episode identity. | Duration is emitted; identity is never inferred from it. |
| A7 | Optional inputs (timestamps, tags, events, context) may be absent. | Absence is neutral. |

## 4. Typed interface

### 4.1 Inputs

| Name | Type | Notes |
|---|---|---|
| `O` | `Observation` | `status ∈ {OK, UNAVAILABLE, INCOMPLETE, CHANGING}`, `entries: Entry[]`, observation moment |
| `Entry` | record | `kind ∈ {FILE, DIRECTORY, OTHER, UNKNOWN}`, `name`, `path`, `size: M<int>`, `birth: M<time>`, `mtime: M<time>`, `stability ∈ {STABLE, CHANGED, UNREADABLE, UNKNOWN}`, `durationSec: M<float>` |
| `M<T>` | tagged union | `Known(v)`, `Missing`, `Unreadable`, `Unstable`, `Unsupported`; never collapsed into `0` or `null` |
| `P` | `Params` | §4.3 |
| `C?` | `Context` | `nominalSec?` (§6.1), `declaredTotal?`, `progress?`, `rewatch?`, `correction?` |
| `Ev?` | `Event[]` | retained Bridge events: `kind ∈ {PLANNED, DOWNLOADED, RENAMED}`, `episode`, `time`, `intendedName?` |

Entries are **current observation refs**: path plus metadata at the observed moment. No permanent file identity is assumed.

### 4.2 Outputs

| Name | Type |
|---|---|
| `Report` | `status`, `folderState`, `identity: IdentityRecord[]`, `duration: DurationRecord[]`, `excluded[]`; or `ConfigError(param, rule)` |
| `IdentityRecord` | `category ∈ {HIGH_CONTEXTUAL, MEDIUM, LOW, UNRESOLVED}`, `ordinal?`, `candidates: Candidate[]`, `reasons[]`, `diagnostics[]` |
| `DurationRecord` | `finding ∈ {LONG, NOT_LONG, UNAVAILABLE}`, `durationSec?`, `reference?`, `referenceSource ∈ {NOMINAL, MEDIAN, NONE}`, `reason?` |
| `Reason`, `Diagnostic` | `{code, scope ∈ {NAMING, FOLDER, TIMELINE, CONTEXT, DURATION}, ruleId}` |

`ordinal` exists only for `HIGH_CONTEXTUAL`, `MEDIUM` and `LOW`. An `UNRESOLVED` record carries its candidate set (possibly empty) and reasons.

### 4.3 Parameters (all uncalibrated examples)

| Parameter | Domain | Meaning | Example |
|---|---|---|---|
| `allowlist` | non-empty set of lowercase extensions | eligible root media extensions | `mp4, mkv, avi` |
| `assumeK`, `assumeRank` | boolean; `assumeRank ⇒ assumeK` | assert A2 and A3 | per run |
| `epsT` | finite ≥ 0, seconds | timestamps are *ordered* only if they differ by more than `epsT` | `1` |
| `tau` | finite ≥ 0, seconds | event proximity window | `3600` |
| `mAlt` | integer ≥ 1 | min files sharing an alternate suffix stem (T3) | `2` |
| `k` | integer ≥ 3 | min valid duration samples for a median reference | `3` |
| `rho` | finite > 1, unitless | ratio threshold | `1.5` |
| `delta` | finite > 0, seconds | excess threshold | `600` |

`rho = 1.5`, `delta = 600 s`, `k = 3` and the rest are **proposal examples**, not calibrated and not defaults. A violated domain returns `ConfigError` deterministically (fail closed, no records).

## 5. Identity branch (S1–S6)

### 5.1 Step map

| ID | Name | Diagram node | Produces |
|---|---|---|---|
| S1 | Observe | `s1_observe` | eligible/excluded entries |
| S2 | Candidates | `s2_extract` | typed `Candidate[]` per file |
| S3 | Folder | `s3_folder` | `FolderState` |
| S4 | Label audit | `s4_audit` | category for labeled and singleton files |
| S5 | Chronology | `s5_chrono` | diagnostics; frozen rank hypotheses for unlabeled files |
| S6 | Verdict | `s6_verdict` | final `IdentityRecord[]` |
| X1 | Abstain | `x1_abstain` | `UNRESOLVED` + candidate set + reasons (from S4 naming conflicts and S5 rank abstention) |
| D1 / D2 / D3 | Reference / Test / Finding | `d1_reference` / `d2_test` / `d3_finding` | `DurationRecord[]` incl. `UNAVAILABLE` |

Diagram colors only group roles (decision gates, derivation, observation, diagnostics, outputs); the legend is hidden and this table is authoritative.

### 5.2 S1 Observe

1. `status = UNAVAILABLE`: no records; both branches stop.
2. **Eligible** iff `kind = FILE` and the lowercase text after the last `.` in `name` is in `allowlist`. Others go to `excluded` with reason `NOT_FILE` or `UNSUPPORTED_EXTENSION`; they are never silently dropped.
3. An eligible entry with `stability ∈ {CHANGED, UNREADABLE}` **stays eligible** (it exists in the listing and counts in `N`); its measurement tags are preserved and gate S4/D1. `INCOMPLETE`/`CHANGING` listings keep their entries but mark `status`.

`N` = count of eligible entries. Results are conditional on this observed moment only.

### 5.3 S2 Candidate extraction

`Candidate = {kind, value, tier, span}`. Digits are ASCII `0-9`; ordinals are integers `1..9999`.

**Basename.** Remove the allowlisted extension, then strip trailing noise repeatedly (precedence order): `[...]` groups; a parenthesized year `(19xx|20xx)`; resolution/codec words (`\d{3,4}p`, `\d{3,4}x\d{3,4}`, `x264`, `x265`, `h264`, `h265`, `10bit`). Other digits are never candidates unless a tier anchors them. A bare 4-digit `19xx|20xx` is a year only when no tier anchors it: `Show - 2013` is ORDINAL 2013 (explicit own suffix beats the year heuristic); `Show (2013) - 05` yields 5.

**Typed tokens** (matched whole, most specific first; never "last integer"):

| Kind | Shape | Compact value |
|---|---|---|
| SPECIAL | `SP`, `OVA`, `OAD`, `NCOP`, `NCED`, `PV` + up to 2 digits; also tag `ZERO` for `0`/`00` and `MALFORMED` for a shaped token that violates its domain (e.g. range with `lo ≥ hi`) | tag |
| MULTI | `NN(MM)`, `NN+MM`, `NN&MM` | `{NN, MM}` |
| RANGE | `NN-MM`, `NN~MM`, `NNtoMM`, `lo < hi` | `[lo, hi]`, never expanded |
| FRACTIONAL | `NN.F` (1–2 fraction digits) | `(NN, F)` |
| ORDINAL | `NN`, optional revision suffix `vK` ignored | `NN` |

**Tiers.** T0–T2 are explicit and evaluated *jointly*; T3 is a fallback.

| Tier | Grammar (on the stripped basename) | Example |
|---|---|---|
| T0 bare | the whole basename is one token | `01(24).mp4`, `3.5.mp4`, `07.mkv` |
| T1 own suffix | `<stem> - <token>` at the end (leftmost split whose remainder is a whole token) | `Show - 07` |
| T2 marker | `S<d>+E<token>`, `EP<token>`, `Episode <token>`, `#<token>` anywhere, token delimited; season/title digits never count | `Show S02E05`, `Show EP3.5 - 01` |
| T3 attached | evaluated only if T0–T2 yield nothing: `<stem>[-_]?<token>` end-attached, stem ends in a letter | `Show-13` |

**T3 acceptance (folder-level, deliberately conservative).** Let `stem(f)` be the basename with its tail token removed, case-folded, with `[\s_.-]+` collapsed. The dominant stem `D` is the most frequent `stem` among T1 files, valid only if shared by at least `ceil(N/2)` files (a tie means no `D`). A T3 candidate is emitted iff its `stem = D` **and** at least `mAlt` T3 files share that stem; otherwise it is dropped. Different spellings of the same title do not match.

**Candidate set `K(f)`** = distinct `(kind, value)` over T0–T2 (or T3 if those are empty). A non-winning FRACTIONAL, RANGE, MULTI or SPECIAL candidate therefore still reveals a contradiction (`Show EP3.5 - 01` → `{ORDINAL 1, FRACTIONAL 3.5}`), while noise digits cannot enter. A future grammar could recognize title families by fuzzy stem matching; this version does not promise such cases.

### 5.4 S3 Folder state

Let `ord(f)` be the ordinal when `K(f)` is exactly one ORDINAL, else undefined; `L` is the multiset of defined `ord(f)`. `FolderState` is the **first** matching row (exhaustive and disjoint by construction):

| # | `FolderState` | Condition |
|---|---|---|
| 1 | `UNOBSERVED` | `O.status ≠ OK` |
| 2 | `EMPTY` | `N = 0` |
| 3 | `CONVENTION_VIOLATED` | `L` has a duplicate, or some value `> N` |
| 4 | `SEQUENCE_CONSISTENT` | every eligible file has a defined `ord`, every eligible file is `STABLE`, and `|L| = N` (so `L = {1..N}`) |
| 5 | `PARTIAL_COMPATIBLE` | otherwise: distinct, in-bound claims, but some files are unlabeled, ambiguous, special, unstable or unreadable (includes `L = ∅`) |

Under K, count `N` is a **structural bound**, not a per-file identity. `SEQUENCE_CONSISTENT` means the **observed ordinal claims are `1..N` under K**; it does not mean the files truly are those episodes and does not mean the anime is complete. Completeness is separate: `COMPLETE_DECLARED` only if `declaredTotal = N`, else `PREFIX_ONLY`/`UNKNOWN`; it never alters a category. A **singleton** is episode 1 only under K *and* compatible context (R7).

**Lineage rule.** Evidence classes are not additive:

| Source | Lineage | Effect |
|---|---|---|
| Filename label | `CURSOR_CONVENTION` | primary evidence in S4 |
| Folder count | `CURSOR_CONVENTION` | corroborates the label under K; same class, hence "contextual" |
| Bridge events | `CURSOR_CONVENTION` | diagnostics only; never raise a category |
| Timestamps | `MUTABLE_FS` | diagnostics and `LOW` hypotheses only |
| Container duration | `MEDIA` | separate duration finding |

### 5.5 S4 Label audit (ordered; first match wins)

| Rule | Condition | Result |
|---|---|---|
| R0 | `stability ∈ {CHANGED, UNREADABLE}` | `UNRESOLVED`, `UNSTABLE_ENTRY`/`UNREADABLE_ENTRY`, candidates = `K(f)` as tentative |
| R1 | `K(f)` contains SPECIAL | `UNRESOLVED`, `SPECIAL_MARKER` |
| R2 | `K(f)` contains FRACTIONAL, RANGE or MULTI | `UNRESOLVED`, `NAMING_AMBIGUOUS` (+ `NAMING_CONFLICT` if `|K(f)| > 1`), candidates = `K(f)` |
| R3 | `K(f)` has two or more distinct ORDINAL values | `UNRESOLVED`, `NAMING_CONFLICT`, candidates = `K(f)` |
| R4 | `ord(f) = n` and another eligible file also has `ord = n` | `UNRESOLVED`, `DUPLICATE_LABEL`, candidates `{n}`; no tiebreak |
| R5 | `ord(f) = n`, `assumeK`, `FolderState = SEQUENCE_CONSISTENT` | `HIGH_CONTEXTUAL`, ordinal `n` |
| R6 | `ord(f) = n` (R1–R4 not matched) | `MEDIUM`, ordinal `n`, reason `FOLDER_UNOBSERVED`, `CONVENTION_VIOLATED`, `K_NOT_ASSERTED` or `FOLDER_NOT_CORROBORATED` |
| R7 | `K(f) = ∅`, `N = 1`, status OK, `assumeK`, context compatible | `LOW`, ordinal `1`, candidates `{ORDINAL 1}`, reason `SINGLETON_CONVENTION` |
| R7b | as R7 but context incompatible | `UNRESOLVED`, `CONTEXT_INCOMPATIBLE`, candidates `{ORDINAL 1}` |
| R8 | `K(f) = ∅` otherwise | `PENDING_RANK` (handed to S5) |

**Context compatible:** `progress` absent or `≤ N`; no event in `Ev` has `episode > N`; neither `rewatch` nor `correction` is set. Context can only *raise uncertainty*; it never infers file content.

**Scopes.** R1–R4 are **naming** ambiguity; folder problems are **folder** scope; chronology problems are **timeline** scope (S5) and never enter this table. `HIGH_CONTEXTUAL` describes the observed folder under K, not true content. An `UNKNOWN` stability never reaches `HIGH_CONTEXTUAL` (R5 needs `FolderState = SEQUENCE_CONSISTENT`, which needs every entry `STABLE`); it yields at most `MEDIUM`.

### 5.6 S5 Chronology (secondary)

For a timeline `x ∈ {birth, mtime}` and files with known times `t`:

```
a <x b   iff t_a, t_b known and t_a + epsT < t_b           # strict partial order
lo_x(f) = 1 + |{ g : g <x f }|     hi_x(f) = N - |{ g : f <x g }|
interval_x(f) = [lo_x(f), hi_x(f)]                         # ties and unknowns widen it
```

Unknown times are incomparable, so they widen the interval (neutral). A stable display order never breaks a tie semantically.

**Diagnostics for files with exactly one ORDINAL `n`** (never change a category):

| Diagnostic | Scope | Condition |
|---|---|---|
| `CHRONOLOGY_DISCREPANCY` | TIMELINE | `n ∉ interval_x(f)` for some available timeline `x` |
| `EVENT_CONSISTENT` | TIMELINE | an event with episode `n` lies within `tau` of a known time of `f` |
| `EVENT_OTHER_EPISODE` | TIMELINE | events lie within `tau` but none has episode `n` |
| `TIMELINE_AMBIGUOUS` | TIMELINE | events within `tau` of `f` span two or more episodes |
| `RENAME_ASSOCIATION` | CONTEXT | a `RENAMED` event gives `intendedName`: an operational association, not independent content proof |

A match requires `|t_event − t| ≤ tau`, so "nearest" beyond `tau` is **not** a match. Repeated events for one episode collapse (a redownload, retry, replacement or rewatch are indistinguishable; none is a new episode). One file is never forced to explain different ordinary episodes. An event with no file in its window is neutral.

**Rank hypotheses (unlabeled files).** Requires `assumeRank` and status OK. All hypotheses are computed from a **frozen** view before any is assigned:

```
Reserved = ordinals of HIGH/MEDIUM verdicts ∪ every ORDINAL candidate of any labeled file
Free     = {1..N} \ Reserved
H(f)     = Free ∩ ⋂ over available timelines x of interval_x(f)      # frozen for all PENDING_RANK f
no known timeline for f            -> UNRESOLVED, INSUFFICIENT_EVIDENCE (empty candidates)
H(f) = ∅                           -> UNRESOLVED, TIMELINE_CONFLICT, candidates = Free ∩ union of intervals
H(f) = {e} and e ∈ H(g) for no other pending g
                                   -> LOW, ordinal e
otherwise                          -> UNRESOLVED, TIMELINE_TIE (|H| > 1) or TIMELINE_SHARED (|H| = 1, shared), candidates = H(f)
```

A tie alone never chooses; other constraints (an untied timeline) can narrow `H` to a singleton. There is no global matching: `H(a) = {1}`, `H(b) = {1,2}` leaves both unresolved. Assignment order cannot matter because each file reads only frozen `H`.

### 5.7 S6 Verdict and X1

S6 emits one `IdentityRecord` per eligible file: reasons by rule ID, diagnostics by code. X1 is the abstention terminal for both naming conflicts (R0–R4, R7b) and rank abstention (`INSUFFICIENT_EVIDENCE`, `TIMELINE_CONFLICT`, `TIMELINE_TIE`, `TIMELINE_SHARED`); it keeps the candidate set the reason names.

### 5.8 Identity pseudocode

```
function triage(O, P, C, Ev):
    if not validParams(P): return ConfigError(firstViolated(P))       # deterministic, no records
    inv <- observe(O, P)                                              # S1
    if inv.status == UNAVAILABLE: return report(inv)
    cand <- { f: extract(f, inv) }; cand <- applyT3(cand, inv, P)     # S2 (T3 is folder-level)
    fs   <- folderState(inv, cand)                                    # S3
    v    <- { f: audit(f, cand, fs, inv, C, Ev, P) }                  # S4: R0..R8
    pending <- { f : v[f].category == PENDING_RANK }
    H    <- { f: frozenHypothesis(f, inv, v, P) for f in pending }    # S5, all before any assignment
    for f in pending: v[f] <- assignRank(f, H)                        # reads H only
    for f with one ORDINAL: v[f].diagnostics += chronology(f, inv, Ev, P)
    return sortCanonical(v)                                           # S6
```

## 6. Duration branch (D1–D3)

It depends only on `durationSec`, `stability`, `C.nominalSec`, `k`, `rho`, `delta`. It never reads a candidate, folder state or verdict, so identity uncertainty cannot suppress a reliable duration finding. With `status ≠ OK` each record carries diagnostic `PARTIAL_OBSERVATION`.

### 6.1 D1 Reference availability

A sample is **valid** iff `durationSec = Known(d)`, `d` finite and `d > 0` seconds, and `stability ∈ {STABLE, UNKNOWN}`. Zero, negative, `NaN`, infinite, non-`Known`, `CHANGED` and `UNREADABLE` samples are invalid and excluded from every computation; that file is `UNAVAILABLE`.

| Case | Reference | Source |
|---|---|---|
| `C.nominalSec` qualified | `C.nominalSec` | `NOMINAL` |
| else valid samples `V` with `count(V) ≥ k` | `median(V)` | `MEDIAN` |
| else | none: `comparisonUnavailable` | `NONE` |

- **Qualified nominal** = a per-episode runtime of an ordinary episode, in finite seconds `> 0`. A series *total* runtime, a total episode count, an unknown unit or a rounded broadcast slot is **not** a valid reference (diagnostic `NOMINAL_INVALID`, then fall through). No built-in 24-minute fallback exists.
- **Median.** Sort `V` ascending, `n` samples. Odd `n = 2m+1`: element at 0-based index `m`. Even `n = 2m`: mean of indexes `m-1` and `m`. The median includes the file under test, so it is robust only when most files are ordinary.

### 6.2 D2 Threshold test

```
LONG  iff  d >= rho * ref   AND   d - ref >= delta        # d, ref, delta in seconds; rho unitless
```

The ratio guards a small excess on a long reference; the excess guards a large ratio on a tiny one. Only unusually *long* files are flagged.

### 6.3 D3 Finding

| Condition | Finding |
|---|---|
| `d` invalid | `UNAVAILABLE`, `INVALID_DURATION` |
| `d` valid, reference `NONE` | `UNAVAILABLE`, `COMPARISON_UNAVAILABLE` |
| `d` valid, reference available, test passes | `LONG` |
| otherwise | `NOT_LONG` |

`LONG` supports an **anime-level** notice without an ordinal. Equal durations are never identity evidence. The proposal never claims which episode was played next.

```
function triageDuration(inv, C, P):
    V <- [ d for f in inv.eligible if valid(f) ]
    ref <- (C.nominalSec, NOMINAL) if qualified(C.nominalSec)
           else (median(V), MEDIAN) if count(V) >= P.k else (none, NONE)
    for f in inv.eligible:
        if not valid(f): UNAVAILABLE(INVALID_DURATION)
        elif ref is NONE: UNAVAILABLE(COMPARISON_UNAVAILABLE)
        elif d >= P.rho*ref and d - ref >= P.delta: LONG
        else: NOT_LONG
```

## 7. Ordering and determinism

| Surface | Canonical order |
|---|---|
| Files | natural sort of `name`: split into ASCII-digit and non-digit runs; digit runs compare numerically (strip leading zeros, then length, then code points); other runs by Unicode code point; ties by full `path` code point. Presentation only. |
| `candidates` | kind rank `ORDINAL < FRACTIONAL < RANGE < MULTI < SPECIAL`, then numeric tuple lexicographically (SPECIAL: tag by code point), then tier, then span start |
| `reasons` | rule ID `R0…R8`, then S5 codes alphabetically |
| Timestamps | strict partial order via `epsT`; ties stay intervals |

No locale, clock or random input. Determinism (I1) is claimed for the **canonical structured output** serialized as UTF-8 JSON with fixed field order and the orders above.

## 8. Complexity

`n` eligible files, `m` events, `ℓ` name length. Candidates per file are bounded by a constant (RANGE is a compact interval); `H` is stored as a run list.

| Step | Straightforward worst case | Optional optimization |
|---|---|---|
| S1–S2 | `O(nℓ)` | |
| S3, S4 | `O(n)` with hash counts | |
| S5 intervals | `O(n²)` pairwise per timeline | `O(n log n)`: sort once, count by binary search |
| S5 `H` and sharing check | `O(n²)` | run-list intersection, still `O(n²)` output worst case |
| S5 events | `O(n·m)` scan | sorted events, `O((n+m) log m)` plus matches |
| D1–D3 | `O(n log n)` | |

Output size is **not** `O(n)`: all-tied pending files each list up to `n` candidates, so explicit output can reach `O(n²)`; matched event lists can reach `O(n·m)`. Total worst case: `O(n² + n·m + nℓ)` time; `O(n + m)` working space, plus output.

## 9. Testable invariants

| ID | Invariant |
|---|---|
| I1 | Same inputs and parameters give identical canonical structured output (§7). |
| I2 | `HIGH_CONTEXTUAL` implies status OK, `assumeK`, `FolderState = SEQUENCE_CONSISTENT` and every eligible entry `STABLE`. |
| I3 | `HIGH_CONTEXTUAL`/`MEDIUM` read no timestamps, events, tags or context. |
| I4 | No two files share an ordinary ordinal across `HIGH_CONTEXTUAL`, `MEDIUM`, `LOW` (duplicates are unresolved; `LOW` ordinals avoid `Reserved` and each other). This is not a claim of correct content or global matching. |
| I5 | A file has at most one ordinary ordinal; no file explains two ordinary episodes. |
| I6 | A timestamp tie or display tiebreak never selects an ordinal; `LOW` needs a singleton `H` from the available constraints under `assumeRank`. |
| I7 | Removing an event or timestamp never lowers a category produced by R5/R6. |
| I8 | Events and renames never change a category. |
| I9 | Duration output is a function of `(durationSec, stability, nominalSec, k, rho, delta)` only. |
| I10 | No score or probability appears in the output. |
| I11 | `01(24).mp4` → `MULTI{1,24}` + `NAMING_AMBIGUOUS`; `3.5.mp4` → `FRACTIONAL`; `0.mp4` → `SPECIAL(ZERO)`; never truncated to the last integer. |
| I12 | Invalid or unavailable measurements stay explicit; never coerced to `0`. |
| I13 | Frozen `H`: permuting file order never changes any category. |

## 10. Worked examples (observed local cases)

| Case | Inputs | Outcome under this proposal |
|---|---|---|
| **Yani Neko** | `-10` birth `Sep 20 06:06:15.918Z`, mtime `Sep 13 03:04:52Z` equals the download-log time; `-11` birth `Sep 20 03:01:24.528Z`. Folder is one of the 13 contiguous ones. | If K is asserted and all entries are `STABLE`: `HIGH_CONTEXTUAL` (R5). S5 adds `CHRONOLOGY_DISCREPANCY` on birth (rank swaps 10/11). No veto; copy or recreation is plausible, not proven. |
| **Super no Ura** | Events 5–10 all have nearest file `-01`; reported current times for 9 and 10 are about 34 days after the events. | Matching needs `\|t_event − t\| ≤ tau`; "nearest" is not one-to-one nor adequately close, so no event diagnostic is produced (neutral). Forcing one file to explain six episodes is forbidden by I5. |
| **Date a Live** | Singleton `01(24).mp4`; 13 declared/watched, 2 cycles. | T0 `MULTI{1,24}` → R2 `UNRESOLVED`, candidates `{1, 24}`. Even a bare `01.mp4` would hit R7b (`progress 13 > N = 1`, rewatch): no automatic episode 1. |
| **Mushoku III** | 14 files: 12 canonical strict `- NN` labels; alternate `muushookuuutenseiiiisekaiithonkidasuusss-13.mp4` and `mushoookuuutennnseiiiseason3isekaihonkidasuss-14.mp4`. Both durations `1420.053 s`. | The two alternate stems differ from each other and from `D`, so T3 accepts neither (`mAlt = 2` unmet). The 12 canonical files: `FolderState = PARTIAL_COMPATIBLE` → `MEDIUM`, reason `FOLDER_NOT_CORROBORATED`. The two unlabeled files are `PENDING_RANK`: `Free = {13, 14}`; under `assumeRank`, strictly ordered timestamps could give `LOW` 13 and 14, a tie or missing times gives `UNRESOLVED` `TIMELINE_TIE`/`INSUFFICIENT_EVIDENCE`. The study does not establish which. No claim that all 14 are `HIGH_CONTEXTUAL`; equal durations are not identity evidence. |
| **Re:Zero** | 19 files labeled `1..19`. Episode 19 duration `41:10.10` (2470.10 s). Event mtime +166 ms, birth −13.734 s. | If K is asserted and entries are `STABLE`: `HIGH_CONTEXTUAL`. Both times lie within `tau` of the event: `EVENT_CONSISTENT`, temporal consistency, not content proof. The study reports no folder reference, so no `LONG` verdict is claimed. |

Duration arithmetic (assumed reference, example parameters): `ref = 1420 s` gives threshold `max(rho·ref, ref+delta) = max(2130, 2020) = 2130 s`; a `2470.10 s` file passes both tests (`≥ 2130`, excess `1050.10 ≥ 600`) and would be `LONG`. This is arithmetic, not a measured result.

## 11. Empirical evidence and limits

Local read-only study. Counts are factual observations, **not accuracy** and not ground truth.

| Observation | Count |
|---|---|
| Snapshots / configured paths | 839 / 838 |
| Readable profiles / root video entries | 22 / 315 (816 paths `ENOENT`) |
| Active profiles (accessible) / inactive accessible | 15 (14) / 8 |
| `D:/Anime` siblings: total / unregistered readable / populated | 26 / 7 / 3 (196 entries: `.random` 74, One Piece 99, Haruhi 23) |
| Strict integer labels / other | 219 of 315 / 96 |
| Contiguous canonical multi-file folders / files | 13 / 168 |
| Birth-order vs label agreement | 166 of 168 (both disagreements Yani Neko) |
| mtime-order vs label agreement | 168 of 168 |
| Populated configured folders with positive, untied times | 20 of 20 (not a universal guarantee) |
| Bridge events | 79 downloaded, 14 anime, 77 anime-episode pairs (80 available), 0 `RENAMED` records |
| Repeated pairs | 2 (Mushoku III 11, Bleach Kashin-tan 7) |
| Events with a unique canonical current candidate / none | 64 / 15 |
| Nearest birth / mtime agrees with that candidate | 52 of 64 / 55 of 64 |
| `ffprobe` headers read (all MP4) / with an episode identity tag | 24 / 0 (one Date a Live `creation_time` 2013-04-06 only) |

Limits that stay attached:

- Entries are root video entries, not a physical deduplication census; no recursive scan, stream metadata or content truth.
- Label-vs-timestamp agreement compares **mutable** hypotheses on **orderly** folders; it is not identification accuracy.
- Event corroboration is **endogenous** (A5), not independent ground truth; events carry no stable path, hash or size.
- The `ffprobe` sample was a convenience sample without Re:Zero or Yani Neko; it says nothing about other formats or stream tags.
- The §4.3 values are not derived from these counts.

## 12. Open decisions and regeneration

- [ ] Approve or replace the tier grammar (T0–T3), special-marker vocabulary and noise list.
- [ ] Choose `epsT`, `tau`, `mAlt`, `k`, `rho`, `delta` from data; none are calibrated.
- [ ] Decide whether K and A_rank are asserted per folder, per anime or by configuration.
- [ ] Decide whether a future T3 may recognize title families (fuzzy stems).
- [ ] Define wording for an anime-level `LONG` notice without an ordinal.

Regenerate the HTML only from the JSON (never hand-edit it). `ARCHIFY_ROOT` is the installed Archify package root (not assumed to be a global command):
`node "$ARCHIFY_ROOT/bin/archify.mjs" deliver workflow docs/episode-identity-triage.diagram.json docs/episode-identity-triage.html --quality showcase`
