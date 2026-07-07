# ADR 007: Code in English; Spanish Only at Explicit Boundaries

## Status
Accepted

## Context
The season-selection contexts grew Spanish identifiers, DB columns, and comments
(`Nota`, `NotaSource`, `RecordEstrenoNota`, `nota_estreno`, `consideracion`, …)
even though those are **bridge-owned** types and tables with no legacy-format
obligation. That is exactly what the adapter pattern is supposed to prevent: the
Spanish legacy shape should be quarantined at the boundary, not leak into the
domain, service, API, or storage layers. Mixed-language code is harder to read,
review, and search, and it blurs the line between "legacy data we must mirror"
and "our own model we are free to name well".

## Decision
**All code is written in English.** Identifiers, function/method names, DB column
names, error strings, and comments are English by default. Spanish is allowed
ONLY at three explicit, justified boundaries:

1. **Legacy adapter surface** — fields that must byte-match the NeDB `animes.dat`
   JSON (`LegacyAnimeRaw` and the `NewAnimeSpec`/projection helpers around it:
   `Pagina`, `Dias`, `NroCapVisto`, `FechaEstreno`, `activo`, `primeravez`, …).
   These are the adapter. Their Spanish is a compatibility contract, not a naming
   choice, and MUST NOT propagate past the adapter into the domain.
2. **Runtime data literals** — Spanish *values* that live in legacy data, not code
   identifiers: the Estrenos section names `"Sin ver"`, `"Ver hoy"`, `"Visto"`,
   estado labels, `"No me gusto"`, etc. These are data the app reads/writes, so
   they stay Spanish; the Go/TS identifiers that carry them are still English.
3. **UI copy** — separate rule (frontend UI text is English anyway; screenshots of
   the legacy app are Spanish and are reference-only).

Cross-service wire contracts (e.g. the mobile season-rating payload) use English
field names too: `{ "anime_id", "grade", "rated_at" }`, not `"nota"`. Fix the wire
name **before** the sister repo consumes it.

### Applying it to shipped Spanish
When a slice touches Spanish bridge code that predates this ADR, it English-ifies
the vocabulary it owns as part of that work:
- SDD-44 renamed the grade vocabulary: `Grade`/`GradeSource`/`RecordPremiereGrade`
  and the columns `premiere_grade`/`grade_source`/`post_season_grade` (with an
  additive `RENAME COLUMN` migration for existing installs).
- The **selection** vocabulary (`Consideracion`/`Verdict` = `Aprobado`/`Reprobado`
  and their enum string values) is owned by SDD-45 and is renamed there, when that
  slice wires its persistence/UI — not pre-emptively in an unrelated commit, to
  avoid mixing two slices' concerns and pre-deciding SDD-45's value naming.

Do not rename shipped Spanish that another pending slice actively owns; let the
owning slice do it. Record any code↔plan drift per the "code wins" rule.

## Consequences
* **Positive:** one language across domain/service/API/storage; greppable, readable,
  reviewable; the legacy Spanish is visibly confined to the adapter.
* **Positive:** cross-repo contracts read consistently (all-English field names).
* **Negative:** touching legacy-adjacent code means a small rename + column
  migration; the adapter boundary must be kept honest so Spanish does not re-leak.
* **Neutral:** renames land slice-by-slice, so a fully-English season context is
  reached incrementally rather than in one sweeping commit.
