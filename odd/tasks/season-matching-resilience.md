# Season matching resilience

Make the Season intake run survive a per-name search failure, and make the Season screen
tells the user what happened without a manual reload. Full design and evidence:
`.pi/artifacts/season-matching-proposed-correction.md`.

## Specs

**S1 — A failed search must not stop the run.**
"el loop de matching esta siendo one-error-block, pero por definición un error en el matching de
Intake list no puede ser bloqueante. Piensalo, por definición no puedes esperar encontrar
absolutamente todos los animes de la lista, aunque sea por typo alguno te fallará"

**S2 — The screen follows the run live, and never needs a reload.**
"si la UI nunca se actualiza, y debería hacerlo en tiempo real, ¿cómo sabrá el usuario que finalizó
el matching? ¿Y los resultados? No podemos esperar a que el usuario reinicie la vista o algo así
para que funcione."

**S3 — The failed row gets its own state, and `pending` means never attempted.**
"search_failed me sirve, pending que quede para antes de ejecutar el primer matching."

**S4 — The run event carries run facts only, never the per-state counters.**
"Y para qué necesitas 'el resultado de esta corrida'? Cuando se cierra una temporada, por lo
general esos datos no se ven para el usuario. Lo usas para algo? Lo de duplicación piensalo bien,
de nuevo, para qué quieres esa info?"

**S5 — Both phases stay in one run.**
"las dos fases van juntas sí o sí. El objetivo final de esa List es literalmente informarle al
usuario que su anime ya está listo para ser visto."

**S6 — The search query never carries a path separator.**
A name containing `/` produces `/buscar/Ranma%201%2F2%20.../` and the site answers 404 with its own
not-found page, so the request never reaches the search handler. Escaping guarantees syntax, not
meaning. `Ranma 1 2 (2024) 3rd Season` returns 200 with the correct candidate. `match.Normalize`
strips every non-alphanumeric character, so the rewrite costs the matcher nothing.

**S7 — The operation is called an "availability check".**
"No me gusta 'sondear' es muy poco intuitivo, si lo que hace es ver si un anime tiene episodios."
Registered in `docs/ubiquitous-language.md`.

**S8 — Derived from S3: a failed row stays retryable.**
`RunMatching` today skips every row that is not `pending`, so a new failure state would never be
retried. The run attempts `pending` rows and **re-attempts `search_failed` rows**; every other
status is skipped.

**S9 — Nothing about a run is persisted.**
Run state is ephemeral: it lives in the session, dies with the panel, and never becomes history.
The season's own rows are the record.

## Tasks

| ID | Scope | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Search query construction: remove the path separator before escaping | S6 | inline | _(pending)_ |
| T2 | Per-row isolation in the matching loop, `search_failed` end to end, retry rule | S1, S3, S8 | worker | _(pending)_ |
| T3 | Run events, store subscription, panel progress and terminal signal | S2, S4, S5, S7, S9 | worker, after T2 | _(pending)_ |
| T4 | Independent verification pass | all | `gentle-ai-verify` | — |
| T5 | Why-log entry for the non-obvious 404 lesson | S6 | inline | _(pending)_ |

Order: T1 is the smallest and gives an early win; T2 is the structural defect; T3 needs the states
T2 introduces. Each unit lands with its tests and its docs in one work-unit commit on
`fix/season-matching-resilience`.

## Tiers

Declared when this unit was opened, per `docs/coverage-tiers.md`. The bar is read tier by tier, never as
one global number, and a surviving mutant is judged against the tier of its own piece.

| Piece | Tier | What it gets |
| --- | --- | --- |
| T1 search query construction, removing the path separator | CORE | Full coverage. It is the data validation that decides what the site receives; get it wrong and the request never reaches the search |
| T2 per-row isolation and the `search_failed` transitions | CORE | Full coverage, every survivor killed or proven equivalent |
| T2 the status label, chip colour, footer counter and chart segment | IMPORTANT | Behaviour coverage of what the user sees. Wording that nothing surfaces is not worth pinning |
| T3a event names, payload structs, the runtime whitelist and the bridge wiring | INFRASTRUCTURE | No tests and no mutation chasing, and out of the mutation scope: the compiler already guarantees them |
| T3a the run boundary and the phase facts it publishes | CORE | Full coverage: a wrong phase or a missing terminal signal reaches the user |
| T3b the season source's payload translation and validation (wire-field mapping, null candidates, unknown phase rejection) | CORE | Full coverage: it decides what reaches the row patch, and TypeScript cannot prove it. The subscription wiring beside it in the same file stays INFRASTRUCTURE and out of the mutation scope, a distinction the independent verifier raised against an earlier version of this table that declared the whole file as wiring |
| T3b the store's run state and the row patch | CORE | Full coverage, survivors killed or proven equivalent |
| T3b the panel's phase display | IMPORTANT | Assert the outcome the user observes. A survivor may stay alive with a recorded reason |

Every deliberate skip is recorded here with its tier and its reason, because an unrecorded skip is
indistinguishable from an oversight. When the residual survivors are all such skips, the unit is finished.

**Recorded skip.** S4, the absence of per-state counters in the run payloads, is INFRASTRUCTURE and stays
untested: the payload complies today, an added field would have no consumer, and the independent verifier
ruled that an unobserved payload change is not a broken user decision. It becomes CORE the day something
consumes those counters.

## Log

**L1** (user, original request): "estoy mandando en Seaon - Intake & Daily el bot'on de Run
matching, pero no me está actualizando la UI. No me he movido de la pantalla y solo me salió un
mensaje de 404. Se ha bloqueado el progreso de matching por un 404?"

**L2** (diagnosis, read-only): the loop aborts on the first search error, and the store reloads rows
only when the command returns `ok`. Two independent defects, plus a `season_changed` broadcast that
never reaches the desktop screen.

**L3** (user, requirements): S1 and S2 quoted above. The user rejected treating a per-name failure
as an exception, and rejected requiring a manual reload for the screen to show results.

**L4** (decisions): A = `search_failed`; B = one event per resolved row (payload: the row, plus the
run total and the terminal signal); C = both phases in one run; D = remove the path separator.
See the artifact for the reasoning and the evidence.

**L5** (user, vocabulary): S7. Registered in `docs/ubiquitous-language.md` (39 lines, uncommitted
in this worktree).

**L6** (user, delivery): "vas a crear un worktree para este fix completo, y moveras todo lo que ya
se toco de dev alla, necesito que dev este libre". Worktree created, `docs/ubiquitous-language.md`
moved here, `dev` left with an empty `git status`.

**L7** (user, authorization): "dale aprobado el odd, hazlo completo".

**L8** (independent verification, and the disposition of its gaps): the verifier passed the principal
behaviours with its own commands and refused an unconditional sign-off. Verified: S1, S2, S6, S7, S8 and the
matching transition of S3. Recorded rather than tested: S4. Closed by new tests after it reported: S5 (the
terminal signal's chronological position, pinned by one tape), S9 (nothing about a run is written, asserted
negatively through the source), and a real SQLite round trip for the new status, because the resilience tests
only ever used an in-memory repository and AGENTS.md treats a unit pass at that boundary as provisional. Both
pinning tests were shown non-vacuous by temporarily introducing the regression each guards. Mutation evidence for the new frontend CORE surface stays OPEN and is recorded as such. It was attempted twice
and both attempts were blocked by tooling rather than by the change: an isolated throwaway worktree cannot
generate the Wails bindings, because a fresh linked worktree fails the frontend postinstall closed; and when the
scope was rebuilt on a throwaway branch inside this worktree instead, the runner refused with its own snapshot
directory pointing at the throwaway worktree that had just been deleted. The unvalidated CORE surface, in the
verifier's own words: the row projection and preservation of non-event fields, run initialization with phase
advancement, reset and no-run handling, non-ok and exception cleanup, the terminal reload, and the runtime phase
and candidate validation. Per the current policy these are resolved retrospectively by the scheduled audit once
it is operational, not by blocking this change. Explicitly not verified anywhere: a real Wails run, a live site
request, whole-tree Fallow cleanliness, and the production build smokes on the current tip. Its tier audit also
corrected this record, see the table above.

**L9** (delivery): the owner validated it working in the real application before authorizing delivery. The run
completed, the rows carried their per-row verdict and episode count with no manual reload, the availability phase
populated the episodes, the available-to-create notice fired with its own rows, and the footer's derived counters
matched what was on screen. The Ranma 1/2 row resolved to ambiguous with its single 82 percent candidate, which is
the designed outcome for a title jkanime spells with the half glyph, not an accident. That closes the real-Wails-run
item on L8's not-verified list, on the owner's observation rather than on a command of ours. Delivered to dev as
ef6baa74, a real merge commit whose whole-tree gate ran 208.11 seconds with every job green and none skipped. Still
unverified, exactly as L8 records: a live site request, whole-tree Fallow cleanliness, the production build smokes on
this tip, and the mutation evidence for the new frontend CORE surface, which stays open for retrospective resolution.
The branch fix/season-matching-resilience is delivered, and nothing is pushed.
