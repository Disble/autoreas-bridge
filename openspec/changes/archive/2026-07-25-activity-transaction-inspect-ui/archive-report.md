# Archive Report: Transaction Inspector — Pills, Code Block, Honest Body Panes

**Archived:** 2026-08-30 (applied 2026-07-25)
**Applied by:** `6330987` — "feat(activity): add a pretty/raw code block and outcome pills to the transaction inspector"
**Archived by:** SDD-65 Slice 0 (close the SDD debt) — documents only, no runtime change.

## What shipped

Colour-coded status and outcome pills resolved through one shared mapping in both the table
and the detail header; an explicit refusal to fabricate an HTTP status for statusless rows
(in-flight arrivals and hub one-way frames); and request/response body panes rendered
through a new reusable `CodeBlock` primitive with distinct captured / not-captured /
redacted states.

## Specs merged into `openspec/specs/`

| Domain | Action | Detail |
| --- | --- | --- |
| `activity-network-transactions` | Updated | 2 MODIFIED (Transaction List View, Transaction Detail Inspector), 4 ADDED (HTTP Status Pill Colour By Class, Outcome Pill Over The Real Capture Vocabulary, Statusless Rows MUST NOT Fabricate An HTTP Status, Honest Request And Response Body Panes). |
| `shared-ui-code-block` | **Created** | Full spec, 7 requirements covering the JSON-only view toggle, Pretty/Raw fidelity, copy-always-raw, the self-clearing confirmation, the not-captured and redacted states, and the dumb presentational boundary. |

Its "Transaction List View" MODIFIED did not mention live rows, which would have dropped
`capture-middleware-realtime`'s "Live rows update without manual refresh" scenario, written
four hours earlier the same day. The merge takes this change's requirement text and
re-appends that scenario.

## Drift corrected, not tidied away

Three `[x]` tasks describe artefacts the code no longer has. They stay ticked — the work was
performed — with inline **DRIFT** notes:

| Task | Claimed | What actually happened |
| --- | --- | --- |
| 2.3 | `CodeBlock/index.ts` re-export barrel | Created as written; deleted by `5646bed` ("remove barrel imports", 2026-08-03) under `docs/adr/011-no-barrel-files.md`. |
| 3.3 | pin `CAPTURE_REDACTION_MARKER`, assert the notice never says "truncated" | The assertion failed loudly and the backend won: `7acb738` (2026-07-25) made the pipeline preserve exact bodies, so the marker no longer exists in `frontend/src`. |
| 3.5 | `CAPTURE_REDACTION_MARKER` + `TRANSACTION_RESPONSE_REDACTED_NOTICE` | Both removed by `7acb738` and replaced by `TRANSACTION_RESPONSE_BODY_TRUNCATED_NOTICE` and the `TRANSACTION_REQUEST_BODY_OMITTED_*` pair. An orphaned JSDoc block for the deleted constant survives at `transaction-panel.constants.ts:17-20`. |

Two live specs carry the matching drift notes:
`openspec/specs/shared-ui-code-block/spec.md` "Dumb Presentational Boundary" (no `index.ts`
today) and `openspec/specs/activity-network-transactions/spec.md` "Honest Request And
Response Body Panes" — whose premise is now inverted, since `toTransactionBody` maps a real
`captureState === 'truncated'` signal to a notice that **does** state truncation
(`transaction-panel.helpers.ts:117-118`). The three-state honesty guarantee still holds; the
"MUST NOT claim truncation" ban does not.

## Task 6.1 closed at archive time

6.1 was the final orchestrator-owned "run the full gate" step. Ticked with an inline note:
the work is committed as `6330987`, so the repo-owned pre-commit gate ran and passed at that
commit. **Slice 0 did not re-run the gate** and makes no claim about the `wails dev` runtime
smoke steps.

## Tasks

30/30 complete (29 at apply time, plus 6.1 closed here).
