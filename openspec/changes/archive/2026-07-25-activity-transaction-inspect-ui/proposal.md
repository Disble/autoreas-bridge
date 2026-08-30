# Proposal: Activity Transaction Inspect UI

**Change**: `activity-transaction-inspect-ui`
**Project**: autoreas-bridge
**Status**: proposed
**Depends on**: committed `activity-devtools-network-view` (the `TransactionPanel`/`TransactionTable`/`TransactionDetail` subtree and the `CaptureRow`/`CaptureDetail` read path), committed `capture-middleware-realtime` (pending arrival rows + hub one-way rows), committed `capture-nomenclature-rename` (`internal/observability/requestcapture`).

---

## Intent

The Activity Network view can already list and open a captured transaction, but the two things an operator actually does with a transaction — **read the body** and **judge the outcome at a glance** — are still raw:

- Bodies render as one undifferentiated `<pre>`. There is no Pretty/Raw switch, no copy affordance, and the "body was never captured" case is faked by writing the literal string `Not captured` **into** the body box (`transaction-panel.helpers.ts:130`), which is indistinguishable from a server that genuinely returned that text. Worse, a body the sanitizer collapsed to `{"error":"response body redacted"}` renders as if the server really sent that JSON — the UI silently lies about provenance.
- Status and outcome are two different colour axes but only one is coloured. `outcome` renders as plain `text-default-500` in both the table and the detail header, so `rejected` and `accepted` look identical. Rows with no HTTP status (in-flight `pending`, and every hub `opened`/`closed`/`pushed` frame) show a bare em-dash where a status chip would be, with no positive signal that "no status" is *correct* for that row rather than missing data.

This change ports the last two UI affordances from the studied `dllm-network` inspector — a reusable Pretty/Raw + Copy code block, and status/outcome colour pills — **as bridge components on HeroUI v3 semantic tokens**, never as a CSS port. Frontend-only; the capture pipeline is untouched.

## Scope

### In Scope

- New shared primitive `frontend/src/shared/ui/CodeBlock/**`: segmented **Pretty/Raw** toggle rendered only when the text parses as a JSON object/array; Pretty = `JSON.stringify(parsed, null, 2)`; Raw = the verbatim string.
- **Copy** button on `CodeBlock` that always copies the **verbatim raw** text regardless of the active view, via `navigator.clipboard.writeText`, with a ~1.5 s inline "Copied" confirmation owned by the hook (timer cleared on unmount).
- Three honest body states on `CodeBlock`: `captured`, `not-captured` (an explicit notice, never an empty box), and `redacted` (the sanitizer's marker, labelled as redaction — see Approach for why *not* "truncated").
- `TransactionDetailRequest` and `TransactionDetailResponse` consume `CodeBlock` instead of hand-rolled `<pre>`.
- **Status pill** coloured by HTTP class: `2xx → success`, `3xx → default`, `4xx → danger`, `5xx → danger`. Rendered only when the row actually has an `httpStatus`.
- **Outcome pill** over the real capture vocabulary — `pending`, `accepted`, `rejected`, `malformed` (HTTP/WS request lifecycle) and `opened`, `closed`, `pushed` (hub one-way frames) — mapped to semantic tokens, with a `default` Null-Object fallback for any future value.
- Both pills rendered in the **table row** and the **detail header**, from the same pure helpers.

### Out of Scope

Explicitly rejected earlier in this port and not revisited here:

- KPI/metrics bar; waterfall timing column; tok/s or any token/generation metric; row virtualization.
- Any backend change, capture-schema change, sanitizer change, or new capture field. In particular: **no `truncated` flag is added** — the honesty requirement is satisfied from data that already exists.
- The live elapsed clock for in-flight rows. **Already shipped** in `capture-middleware-realtime` (`shared/hooks/use-elapsed-clock`, `toTransactionRow(row, now)`); it is not re-planned.
- `NetworkPanel`/`NetworkDetail` (the Events log view) — a structurally different dataset, untouched.
- Copy on anything other than a `CodeBlock` body (no copy-row, copy-as-cURL, copy-request-id).

## Capabilities

### New Capabilities

- `shared-ui-code-block`: the reusable Pretty/Raw + Copy code block primitive, its JSON-detection rule, its copy-raw invariant, and its three capture-state renderings.

### Modified Capabilities

- `activity-network-transactions`: the transaction table and detail inspector gain status and outcome pills, MUST NOT fabricate a status for statusless rows, and MUST render request/response bodies through `CodeBlock` with honest not-captured / redacted states.

## Approach

Two independently-shippable frontend slices, tests-first.

**Slice A — `shared/ui/CodeBlock`.** A folder-owned module (`index.ts`, `CodeBlock.tsx`, `use-code-block.ts`, `code-block.helpers.ts`, `code-block.types.ts`, `code-block.constants.ts`, `__tests__/`). All parsing/formatting lives in JSDoc'd pure helpers; the copy-confirmation timer and the Pretty/Raw selection live in the hook; the `.tsx` is dumb HeroUI (`ToggleButtonGroup` for the segmented switch, `Button` for Copy) with zero `useEffect`.

**Truncation honesty — the decision.** `SanitizeResponseBody` (`internal/observability/requestcapture/telemetry.go`) exposes **no truncation flag**. It collapses *both* non-JSON input *and* an over-2 KB sanitized result to one literal marker, `{"error":"response body redacted"}`. Upstream, `capturingResponseWriter.Write` (`internal/api/capture_middleware.go:151`) hard-cuts the retained body at 4 KB, so an oversized body arrives at the sanitizer already invalid and also lands on the same marker. These three causes are **indistinguishable after the fact**. Therefore the UI does **not** claim "truncated": it detects the exact marker constant and renders a *redaction* notice naming all three possible causes. Two further facts, surfaced rather than hidden: the sanitizer key-allowlists the body to `{error,status,message,conflict,code,kept_grade}`, so a captured response body is a *projection*, not the wire body; and the middleware only sanitizes a response body at all when `status >= 400`, so a 2xx transaction legitimately has **no** response body. No invented flag, no invented backend field.

**Slice B — pills.** No new pill component: HeroUI `Chip` already *is* the project's tag/badge primitive (`autoreas-theme` component-mapping table) and is already used for status in `TransactionTable`/`TransactionDetail`. The change is semantic, not structural: extend the existing pure helpers in `transaction-panel.helpers.ts` with `getTransactionOutcomeColor` and a `hasHttpStatus` view-model flag, widen `getTransactionStatusColor` to the agreed class mapping, and render a second `Chip` for outcome in both consumers.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `frontend/src/shared/ui/CodeBlock/**` | **New** | 6 source files + `__tests__/` — the reusable Pretty/Raw + Copy block |
| `frontend/src/features/network/ui/TransactionDetail/TransactionDetailRequest.tsx` | Modified | `<pre>` → `CodeBlock`; takes a body view-model instead of a bare string |
| `frontend/src/features/network/ui/TransactionDetail/TransactionDetailResponse.tsx` | Modified | Same, plus the redacted/not-captured states |
| `frontend/src/features/network/ui/TransactionDetail/TransactionDetail.tsx` | Modified | Outcome `Chip` in the header; status `Chip` only when `hasHttpStatus` |
| `frontend/src/features/network/ui/TransactionTable/TransactionTable.tsx` | Modified | Outcome cell `span` → `Chip`; status cell conditional |
| `frontend/src/features/network/ui/TransactionPanel/transaction-panel.helpers.ts` | Modified | `getTransactionOutcomeColor`, `toTransactionBody`, `hasHttpStatus`; status-class mapping widened |
| `frontend/src/features/network/ui/TransactionPanel/transaction-panel.types.ts` | Modified | `TransactionBodyViewModel`, `outcomeColor`, `hasHttpStatus` (all `readonly`) |
| `frontend/src/features/network/ui/TransactionPanel/transaction-panel.constants.ts` | Modified | Redaction marker constant, notice copy, Pretty/Raw labels |
| `frontend/src/features/network/ui/**/__tests__/**` | Modified | Existing status-colour and body-string assertions updated |
| `internal/**`, `docs/openapi.yaml` | **Untouched** | No wire, schema, sanitizer, or capture change |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| **4xx colour change is a visible regression to a shipped mapping.** `getTransactionStatusColor` currently returns `warning` for 4xx; this change makes it `danger` | High (certain) | Deliberate and recorded in `design.md` §Drift. DevTools treats 4xx and 5xx alike; the *outcome* pill now carries the client-vs-server nuance (`malformed → warning`). Existing helper test updated in the same commit. |
| Redaction detection by exact string match breaks if the marker literal changes | Med | The marker is a Go `const` (`redactedResponseBodyMarker`); the frontend mirrors it as a single named constant with a comment pointing at `telemetry.go`, and a test pins the exact literal. A drifted marker degrades to rendering the JSON verbatim — never to a wrong claim. |
| A real server response whose body is literally the marker string is mislabelled as redacted | Low | Accepted and documented. The sanitizer's key-allowlist means such a body would have to originate from the bridge itself; misreading it as "redacted" is a strictly safer failure than the current behaviour of presenting a redaction as real data. |
| `navigator.clipboard` is unavailable/denied in WebView2 | Low | The copy callback owns its rejected promise (the `PairingPanel` precedent); a failed copy simply does not show the confirmation. No unhandled rejection, no crash. |
| Request pane has no server-verbatim string (`payload` arrives already parsed as an object) | Med | Documented asymmetry: "raw" for the request pane is defined as compact `JSON.stringify(payload)`, pretty as the 2-space form. Stated in `design.md` and asserted in tests so it is a decision, not an accident. |
| `transaction-panel.helpers.ts` grows past the 400-line warning | Low | Currently 133 effective lines; the slice adds ~60. `go`/frontend filesize gates run per group; split only if the warning fires. |
| dlinter `strict-colocation` rejects a root-level `export const` in a governed main-module file | Med | All exported constants live in `*.constants.ts` / `*.helpers.ts` (exempt), never in `CodeBlock.tsx` or `use-code-block.ts`. |

## Rollback Plan

Pure frontend, no persisted state and no wire contract. Revert the change's commits; the previous `<pre>` bodies and uncoloured outcome text return with no migration and no data effect. Per-slice revert also works: Slice B (pills) is independent of Slice A (`CodeBlock`), and reverting only Slice A leaves the pills intact because they share no module.

## Dependencies

- `@heroui/react@^3.2.x` — `Chip`, `ToggleButtonGroup`/`ToggleButton`, `Button` (all already in use; no new dependency).
- `navigator.clipboard.writeText` in WebView2 (already relied on by `PairingPanel`).
- The `redactedResponseBodyMarker` literal in `internal/observability/requestcapture/telemetry.go` stays stable (read-only dependency; not modified here).

## Success Criteria

- [ ] A JSON body shows a Pretty/Raw toggle; a non-JSON body shows none, and the toggle never appears for a scalar (`123`, `"text"`, `null`).
- [ ] Pretty renders `JSON.stringify(parsed, null, 2)`; Raw renders the byte-identical original string.
- [ ] Copy writes the **verbatim raw** text in both views, and the "Copied" confirmation appears and clears itself ~1.5 s later without leaking a timer on unmount.
- [ ] A transaction with no captured response body shows an explicit "Not captured" notice with its reason — never an empty box and never the literal string `Not captured` inside the body area.
- [ ] A body equal to `{"error":"response body redacted"}` renders a redaction notice naming all three possible causes, and is never presented as the server's real response.
- [ ] Status pill colours follow `2xx → success`, `3xx → default`, `4xx → danger`, `5xx → danger`, and use HeroUI `Chip` with semantic tokens only — no hex, no ported `dllm-network` CSS.
- [ ] Outcome pill covers `pending`, `accepted`, `rejected`, `malformed`, `opened`, `closed`, `pushed`, and falls back to `default` for anything unknown.
- [ ] A `pending` row and every hub `opened`/`closed`/`pushed` row show **no** HTTP status pill — no `0`, no `200`, no fabricated value — while their outcome pill carries the meaning.
- [ ] Both pills render in the table row **and** the detail header, resolved by the same helper (no duplicated switch).
- [ ] No file exceeds 500 effective lines; `bun --cwd="frontend" run typecheck && lint && test` is green; no Go file and no `docs/openapi.yaml` wire section changes.
