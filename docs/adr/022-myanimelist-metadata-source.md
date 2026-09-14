# ADR-022: MyAnimeList metadata source

- **Status**: Accepted, implemented
- **Date**: 2026-09-12
- **Supersedes**: nothing
- **Related**: `docs/adr/007-english-code-spanish-boundaries.md` (Spanish-only boundaries; this
  module has none — MyAnimeList's own vocabulary is English), `docs/adr/011-no-barrel-files.md`
  (the `shared/metadata-lookup/` module follows the same concrete-path-import rule),
  `docs/ubiquitous-language.md` (the `Status:`/`estado` entry this ADR's D5 makes structurally
  unavailable to conflate).

## Context

SDD-70 fills the Create and Edit anime forms from MyAnimeList with one confirm-gated lookup. Three
decisions recur across this document because they were the ones a reviewer is most likely to
second-guess without the evidence behind them: which HTML-parsing approach to trust, how a markup
change should fail, and how to stop MAL's own vocabulary from leaking into the bridge's. A fourth —
where the work landed as commits — is recorded because it shaped how the change was split, not
because it changed any runtime behavior.

## Decision

### D1 — HTML parsing: `golang.org/x/net/html`, not `regexp`

This is a robustness choice, not a feasibility one. Label-anchored extraction — *"locate the label
span, take the rest of its parent div"* — was **proven working with plain `regexp` during
exploration**. Both approaches can extract today's page. The decision is about which one keeps
working, and at what price when the markup drifts.

| | |
|---|---|
| **Choice** | `golang.org/x/net/html`. Already in the module graph — `go.mod:54`,`golang.org/x/net v0.56.0 // indirect`, pulled in by Wails and pinned in `go.sum`. Adoption is a one-line promotion from indirect to a direct `require` against a version the build already resolves: `go.mod` gains one line, `go.sum` does not change at all. No new download, no new supply-chain surface. |
| **Rejected — `regexp`** | The extraction rule — *"take the rest of the parent div"* — is a TREE relation, not a pattern a regular expression can express. A regex must guess the matching `</div>` and cannot count nesting, so adjacent sibling blocks (`Genres:`/`Themes:`/`Demographic:`) are one greedy quantifier away from reading the next field's value as this one's. The `jkanime/search.go:17` precedent that already uses `regexp` in this repository holds because its target is a single flat `<h5><a href>` pattern with no nesting to cross; MAL's information block is not that shape. |
| **Rejected — `goquery`** | A genuinely new module (plus `andybalholm/cascadia`) buying a CSS-selector layer over the same `x/net/html` tree the change would already hold. |
| **Rejected — headless browser** | Measured unnecessary: a plain GET returns `200` with and without a browser User-Agent (explore.md § 2.4). |

**The tie breaks on failure mode, not capability.** A regex that drifts returns a *plausible wrong
value* — it still matches something, just not the right span. A tree walk that drifts returns *no
node* — the locator simply fails to find what it was looking for. D2 turns "no node" into a loud,
typed error. A silently wrong value is the one failure mode this whole module exists to prevent, so
the parsing library was chosen for the shape of its failure, not for whether it can parse the page
in front of it today.

**Free consequence, worth stating:** a response body truncated by `io.LimitReader` loses its
trailing anchors — the DOM walk simply never reaches them — so the anchor set (D2) doubles as the
truncation detector. No second mechanism is needed to catch a body cut short.

### D2 — The noisy-error contract, and its third outcome

Every label MAL's detail page can show falls into exactly one of three tiers, assigned by one rule:

> A field is an **anchor** when its absence can only mean the markup changed. It is **optional**
> when its absence can mean the anime genuinely lacks it.

| Tier | Labels | Absence means | Value used? |
|---|---|---|---|
| Anchor | title heading, `Type:`, `Status:` | markup drift — abort the whole fetch with `*DriftError{Anchor}` | only `Type:`; `Status:` is presence-checked and discarded |
| Mapped | `Episodes:`, `Duration:`, `Source:`, `Studios:`/`Studio:`, `Genres:`/`Genre:` | the anime genuinely lacks it — leave empty, append to `Unfilled` | yes |
| Unparsed | `Premiered:`, `Themes:`, `Demographic:`, and nine others | — never read at all | no |

Anchors are anchors because they are present on **every** anime page independent of the anime's own
properties — a TV show and a movie both carry a `Type:` label, just with different values. Mapped
fields are excluded from the anchor set precisely because their presence tracks the *anime*, not the
markup: a movie legitimately has no `Studios:` block worth flagging as drift.

**The part that prevents the real failure is the third outcome.** Present-but-unparseable is drift,
not optional absence:

| | absent | present, parsed | present, unrecognized shape |
|---|---|---|---|
| Anchor | `DriftError` | ok | `DriftError` |
| Mapped | `Unfilled` | ok | **`DriftError`** |

So a reworded `Duration: 24 minutes/episode` returns `*DriftError{Anchor:"Duration:"}` and **never
`0`** — and the same applies to `Episodes:` holding neither digits nor the literal string
`Unknown`. Without this third outcome, a rewording that a naive parser cannot recognize looks
identical to an anime that simply lacks the field, and a zero gets written silently into a user's
form. That silent zero is the exact failure this contract exists to prevent; "the field is
unparseable" and "the field is absent" must never collapse into the same code path.

Trap #1 from exploration (a single-genre anime uses the singular label `Genre:`, not the plural
`Genres:`) falls out of the locator design rather than needing a special case: each mapped-field
locator accepts a **set** of labels (`{"Genres:", "Genre:"}`, `{"Studios:", "Studio:"}`), so a
parser matching only the plural form — which would return empty silently for every single-genre
anime — never ships.

### D5 — Isolation enforced, not reviewed

`internal/myanimelist` speaks MyAnimeList's vocabulary only, and a `.golangci.yml` depguard rule
(`myanimelist-speaks-only-mal`, beside the existing `domain-purity` and `wails-confined-to-edge`
rules) denies it from importing `internal/anime` or `internal/api/contracts`. The MAL→bridge mapping
lives entirely outside the module: `frontend/src/shared/metadata-lookup/` performs the first
translation hop (MAL vocabulary → a neutral `AnimeMetadataSelection`), and each feature performs the
second (that selection → its own draft patch).

```yaml
myanimelist-speaks-only-mal:
  files: ["**/internal/myanimelist/**"]
  deny:
    - pkg: "autoreas-bridge/internal/anime"
      desc: "internal/myanimelist speaks MyAnimeList's vocabulary only; the MAL→bridge mapping lives outside it"
    - pkg: "autoreas-bridge/internal/api/contracts"
      desc: "the MAL module returns MAL-shaped values; the DTO conversion belongs in internal/desktop"
```

**This is what makes the sharpest trap in the whole change structurally unavailable rather than
merely documented.** MAL's `Status:` label reports **airing status** (`Currently Airing`,
`Finished Airing`); the bridge's `status` field on the editor draft is the user's own **watching**
`estado`. Same English word, two unrelated domains. A module that speaks only MAL's vocabulary
cannot write MAL's airing status into the user's watching progress, because it holds no reference to
the type that field lives on — the mistake is not merely avoided, it has nowhere to happen. See
`docs/ubiquitous-language.md` for the entry this ADR adds distinguishing the two.

Verified by lint probe, following the same mechanism the two existing depguard rules use in this
repository (no permanent Go test backs `domain-purity` or `wails-confined-to-edge` either — both are
verified by running `golangci-lint run` itself): a deliberate `internal/anime` import was added to a
throwaway file under `internal/myanimelist/`, `golangci-lint run` was confirmed to fail on exactly
the new rule's message, and the throwaway file was deleted. No probe file ships in this change.

### D12 — The delivery unit is the commit, not the pull request

This repository has exactly one pull request in its entire history; work lands as a series of
commits on `dev`. `size:exception` was accepted at the branch level for this change precisely
because the PR is not the unit this repository ships against — the unit that must respect a budget
is the commit, at roughly 600 changed lines per CLAUDE.md § 22. Three of design.md's eight slices
(2, 4, 5) measured over that band and were subdivided before apply into eleven work units, each
gated by its own RED → GREEN → MUTATE → REFACTOR cycle and its own commit.

A second measured fact shaped that split: `tools/checksdd` requires the **complete** change — all
four artifacts present, every task checked, a passing verify verdict — before its gate passes, and
its file-change detection globs on `*.go`. No partial slice of this change could land as its own
gated commit while `checksdd` still saw an incomplete change; the eleven work units are eleven
commits inside one still-open SDD change, not eleven independently verifiable deliveries.

## Drift recorded during this change (CLAUDE.md #2)

Two instruction/repository mismatches, verified again during this phase and documented here for a
future reader rather than fixed in this change's scope:

- **`.atl/active-sdd-change` cannot be committed, yet it is load-bearing for every commit.**
  `.atl/` is listed in `.gitignore` (lines 6, 18, 19, 28), so this marker file never travels with
  the repository. `tools/checksdd/main.go`'s `detectActiveChange` reads it first; only when it is
  absent or empty does it fall back to scanning `openspec/changes/` for non-`archive` directories —
  and that fallback errors the moment more than one such directory exists. This repository has 37
  non-archived change directories today (most of them historical, pre-dating the `archive/`
  convention), so the fallback **always** errors in practice: the marker is not an optimization, it
  is the only path that ever succeeds. A fresh worktree therefore starts with no way to `git commit`
  until someone creates `.atl/active-sdd-change` by hand naming the active change — this worktree
  had it recreated already (verified present, naming `2026-09-12-sdd-70-mal-metadata`), so this
  change's own commits are unaffected, but the gap reproduces for the next fresh worktree.
- **`bridge-testing` and `bridge-debugging` do not exist.** `CLAUDE.md` notes #5 and #6 instruct
  agents to load them for bridge test work and regression investigation respectively. Neither
  resolves locally (`.claude/skills/`) nor globally (`~/.claude/skills/`) — re-verified during this
  phase, first recorded in `explore.md` § 5.

## Consequences

- A future markup change on MAL's detail page fails loudly, naming the specific anchor that broke,
  rather than writing a plausible-looking wrong value into a user's form.
- Adding a new mapped field means adding it to the "mapped" tier's label set and its own
  present-but-unparseable test case; adding it to the "unparsed" tier costs nothing until a form
  gains a place to put it.
- `internal/myanimelist` cannot be extended to write directly into `internal/anime` or `internal/api/contracts`
  without failing lint — a second hop must be added on the consuming side instead.
- `docs/openapi.yaml` carries no diff for this change: the two new bindings are desktop-only Wails
  methods, with no REST route or WebSocket event.

## Alternatives considered

Covered inline under D1 (`regexp`, `goquery`, headless browser) and D2 (a two-tier contract with no
present-but-unparseable outcome, rejected because it collapses "reworded" and "absent" into the same
silent-empty result). No repository-wide module-boundary mechanism beyond the existing depguard
pattern was considered for D5 — it is the same enforcement `domain-purity` and
`wails-confined-to-edge` already use, applied to a third boundary.
