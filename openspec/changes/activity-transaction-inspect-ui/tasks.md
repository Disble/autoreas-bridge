# Tasks: Activity Transaction Inspect UI

Ordered, TDD-first (tests written/RED before implementation/GREEN). Each task
lists the spec requirement(s) it satisfies and its parallel/sequential lane.

Legend: **[P]** = can run in parallel with sibling `[P]` tasks in the same group
once its own prerequisites are met. **[S]** = strictly sequential (depends on
the immediately preceding task).

**Standing frontend constraints for every task in this change:**

- `.tsx` files are dumb UI only: HeroUI v3 + Tailwind, **no `useEffect`**, no
  Wails call, no parsing/formatting logic — including under `shared/ui`
  (`dlinter/no-view-effects`, `dlinter/no-infrastructure-in-view`).
- `dlinter/strict-colocation`: a root-level `export const` is **forbidden** in a
  governed main-module file (`CodeBlock.tsx`, `use-code-block.ts`) but **exempt**
  in `*.helpers.ts`. Every shared literal goes in `*.constants.ts`.
- `dlinter/pure-index-barrel` + `folder-ownership`: `CodeBlock/index.ts`
  re-exports only and declares nothing.
- `dlinter/hook-anatomy` for `use-*.ts`: refs → state → context/3rd-party →
  queries → derived (`useMemo`) → callbacks (`useCallback`) → effects → return.
- `dlinter/readonly-props`: **every** field of every `*Props` interface and every
  added view-model field is `readonly`.
- JSDoc on **every** exported helper, type, and constant
  (`jsdoc/require-jsdoc`, `dlinter/require-exported-variable-jsdoc`).
- Semantic HeroUI colour tokens only (`success`/`warning`/`danger`/`accent`/
  `default`). **No hex, no oklch, no ported `dllm-network` CSS.**
- All copy in English (project rule 13 + the frontend-UI-English convention).
- `bun --cwd="frontend" run typecheck && lint && test` after every group;
  `bun --cwd="frontend" run filesize:warning` stays advisory, ESLint's `>500`
  is the hard gate. No file in this change should exceed ~200 lines.

---

## Delivery Guard (Section E forecast)

Frontend-only. Slice A adds 6 small source files + 3 test files; Slice B edits
6 existing files + 4 test files. Estimated ~600 changed lines including tests,
of which roughly half are new tests.

    Decision needed before apply: Yes
    Chained PRs recommended: Yes
    400-line budget risk: Medium

Recommended chain, two PRs, each independently green and revertible. PR #1
targets the feature branch; PR #2 targets PR #1's branch:

| PR | Groups | Character |
|---|---|---|
| 1 | 1–2 | New `shared/ui/CodeBlock` primitive, self-contained, zero consumers changed |
| 2 | 3–5 | Pills + body panes wired into the transaction view (the only PR touching shipped behaviour, including the 4xx colour flip) |

Groups 1–2 and Group 3 are **mutually independent** — they share no module — so
Group 3 may also be developed in parallel and merged in either order. Group 4
is the only join point. If the delivery strategy resolves to a single PR, that
is acceptable at ~600 lines only with an explicit `size:exception`.

---

## Group 0 — Baseline [S]

- [x] **0.1** Capture a green baseline: `bun --cwd="frontend" run typecheck`,
      `lint`, `test`. Record the current `transaction-panel.helpers.ts` effective
      line count (133) for the Group 3 file-size check. No spec req (safety net).
- [x] **0.2** [S] Confirm the two runtime facts this change depends on, and
      re-read them rather than trusting this document:
      (a) `internal/observability/requestcapture/telemetry.go` still defines
      `redactedResponseBodyMarker = '{"error":"response body redacted"}'` and
      still has **no** truncation flag;
      (b) `internal/api/capture_middleware.go` still sanitizes a response body
      only when `status >= 400`, and still cuts the retained body at 4096 bytes.
      If either has changed, STOP and revise `design.md` §Truncation honesty
      before writing any test.
      Satisfies: activity-network-transactions "Honest Request And Response Body
      Panes" (evidence basis).

## Group 1 — CodeBlock pure core (Design §Interfaces) [S after 0.2] — PR #1

- [x] **1.1** [TDD-RED] Create
      `frontend/src/shared/ui/CodeBlock/__tests__/code-block.helpers.test.ts`:
      `isJsonCodeText` returns true for a JSON **object** and a JSON **array**,
      and false for `'123'`, `'"text"'`, `'true'`, `'null'`, `''`, and
      `'Internal Server Error'`; `toPrettyCodeText` returns
      `JSON.stringify(JSON.parse(raw), null, 2)` for JSON and the untouched
      string otherwise; `resolveCodeText(raw, 'raw')` is byte-identical to `raw`
      including insignificant whitespace and key order; `resolveCodeText(raw,
      'pretty')` on non-JSON falls back to `raw`.
      Satisfies: shared-ui-code-block "JSON-Only View Toggle" (all 4 scenarios),
      "Pretty And Raw Rendering Fidelity" (scenarios 1-2).
- [x] **1.2** [TDD-GREEN] Create
      `frontend/src/shared/ui/CodeBlock/code-block.types.ts` (`CodeBlockState`,
      `CodeBlockView`, `CodeBlockProps` — every field `readonly`, every export
      JSDoc'd) and `code-block.helpers.ts` (`isJsonCodeText`,
      `toPrettyCodeText`, `resolveCodeText`). The JSON rule is
      "`JSON.parse` succeeds **and** the result is a non-null `object`" — state
      the scalar exclusion in the JSDoc so it reads as a decision, not an
      oversight. Depends on: 1.1.
- [x] **1.3** [TDD-GREEN] [S] Create
      `frontend/src/shared/ui/CodeBlock/code-block.constants.ts`:
      `COPY_CONFIRMATION_MS = 1500`, `COPY_IDLE_LABEL`, `COPY_DONE_LABEL`,
      `CODE_BLOCK_VIEW_OPTIONS` (the Pretty/Raw toggle options), and the
      empty-captured-content copy. JSDoc each. Depends on: 1.2.

- [x] **1.4** [TDD-RED] Create
      `frontend/src/shared/ui/CodeBlock/__tests__/use-code-block.test.ts` with
      `vi.useFakeTimers()` and a stubbed clipboard
      (`Object.defineProperty(globalThis.navigator, 'clipboard', …)`, the
      `use-pairing-panel.test.ts` pattern). Assert:
      - `onCopy` calls `writeText` with the **raw** string while `view` is
        `'pretty'` — explicitly NOT the indented text;
      - `onCopy` calls `writeText` with the raw string while `view` is `'raw'`;
      - `onCopy` on non-JSON text copies that text;
      - `isCopied` flips true, and returns to false after
        `COPY_CONFIRMATION_MS`;
      - a second `onCopy` inside the window keeps `isCopied` true and restarts
        the window;
      - unmounting mid-window clears the timer and produces no post-unmount
        state update (assert no React act warning / no further transition);
      - a **rejecting** `writeText` leaves `isCopied` false and throws nothing.
      Satisfies: shared-ui-code-block "Copy Always Copies The Raw Text" (all 3),
      "Copy Confirmation Is Transient And Self-Clearing" (all 4).
- [x] **1.5** [TDD-GREEN] Create
      `frontend/src/shared/ui/CodeBlock/use-code-block.ts` in strict hook
      anatomy: `timerRef` (ref) → `view`/`isCopied` (state) → `isJson`/`text`
      (`useMemo` over the pure helpers) → `onViewChange`/`onCopy`
      (`useCallback`) → one `useEffect` whose cleanup clears `timerRef.current`
      → return. `onCopy` MUST pass `raw`, never the derived `text`, and MUST own
      its rejected promise at the callback boundary. Do **not** copy
      `usePairingPanel`'s un-cleared timer (Design §Drift 5).
      Depends on: 1.3, 1.4.
- [x] **1.6** [S] `bun --cwd="frontend" run typecheck && lint && test`.
      Depends on: 1.5.

## Group 2 — CodeBlock presentation (Design §File Changes) [S after Group 1] — PR #1

- [x] **2.1** [TDD-RED] Create
      `frontend/src/shared/ui/CodeBlock/__tests__/CodeBlock.test.tsx`:
      - a JSON-object `raw` renders a Pretty/Raw switch (query by
        **`role="radio"`** — a single-select `ToggleButtonGroup` is a radiogroup,
        per the theme skill) with Pretty selected by default;
      - a non-JSON `raw` and a scalar `raw` render **no** switch;
      - clicking Raw renders the verbatim string (React Aria `usePress`
        responds to `fireEvent.click`; `@testing-library/user-event` is not
        installed);
      - `state='not-captured'` renders the caller's notice, renders **no** code
        area, and offers **no** Copy and **no** switch;
      - `state='redacted'` renders the caller's redaction notice and does not
        present the marker as the origin's response;
      - `state='captured'` with `raw=''` does NOT show the not-captured notice
        and conveys empty captured content instead.
      Satisfies: shared-ui-code-block "Honest Not-Captured State" (both),
      "Honest Redacted State" (both), "JSON-Only View Toggle" (render side).
- [x] **2.2** [TDD-GREEN] Create
      `frontend/src/shared/ui/CodeBlock/CodeBlock.tsx`: dumb component consuming
      `useCodeBlock`. `ToggleButtonGroup` + `ToggleButton`
      (`selectionMode="single"`, `disallowEmptySelection`, `size="sm"`) for the
      switch; HeroUI `Button` (`variant="tertiary"`, `size="sm"`, **`onPress`**)
      for Copy showing `COPY_DONE_LABEL` while `isCopied`; `<pre>` for the body
      reusing the existing pane classes
      (`max-h-64 overflow-auto rounded-md bg-content2/40 p-2 font-mono text-xs`).
      Non-`captured` states short-circuit to the notice block. **No `useEffect`,
      no root-level `export const`.** Depends on: 2.1.
- [x] **2.3** [TDD-GREEN] [S] Create
      `frontend/src/shared/ui/CodeBlock/index.ts` — a pure re-export barrel for
      `CodeBlock` and the public types. Nothing is declared in it.
      Satisfies: shared-ui-code-block "Dumb Presentational Boundary".
      Depends on: 2.2.
- [x] **2.4** [S] `bun --cwd="frontend" run typecheck && lint && test` +
      `filesize:warning`. `CodeBlock.tsx` projected ~90 lines; if any file
      crosses 200, split the notice block into its own colocated `.tsx` now
      rather than after it has consumers. Depends on: 2.3.

## Group 3 — Pill + body view models (Design §Outcome vocabulary) [S after 0.2; independent of Groups 1-2] — PR #2

- [x] **3.1** [TDD-RED] Extend
      `frontend/src/features/network/ui/TransactionPanel/__tests__/transaction-panel.helpers.test.ts`
      for `getTransactionStatusColor`: `200/201/204 → 'success'`;
      `301/304 → 'default'`; **`404 → 'danger'`** (this **flips** the shipped
      `'warning'` expectation — Design §Drift 1, update the existing assertion,
      do not add a second contradictory one); `500 → 'danger'`;
      `100 → 'default'`; `999 → 'default'`; `undefined → 'default'`.
      Satisfies: activity-network-transactions "HTTP Status Pill Colour By
      Class" (all 4 scenarios).
- [x] **3.2** [TDD-RED] [P] Add `getTransactionOutcomeColor` cases to the same
      file: `accepted → 'success'`, `pushed → 'success'`, `rejected → 'danger'`,
      `malformed → 'warning'`, `pending → 'accent'`, `opened → 'accent'`,
      `closed → 'default'`, and an unknown value (e.g. `'quarantined'`) →
      `'default'` **without throwing**. Assert explicitly that `malformed` and
      `rejected` do NOT resolve to the same token. Do **not** add a `stale`
      case — no such capture outcome exists (Design §Outcome vocabulary).
      Satisfies: activity-network-transactions "Outcome Pill Over The Real
      Capture Vocabulary" (all 6 scenarios).
- [x] **3.3** [TDD-RED] [P] Add `toTransactionBody` cases to the same file:
      - a captured JSON string → `{ state: 'captured', raw: <verbatim> }`;
      - `undefined` response body → `{ state: 'not-captured' }` with the
        expected-for-2xx notice, and **no** raw content;
      - a body exactly equal to `CAPTURE_REDACTION_MARKER` →
        `{ state: 'redacted' }` with a notice that names all three possible
        causes and **does NOT contain the word "truncated"** (assert the
        negative explicitly);
      - a payload object with no fields → `{ state: 'not-captured' }` with the
        no-payload notice;
      - a populated payload object → `{ state: 'captured', raw:
        JSON.stringify(payload) }` (**compact**, the declared raw form —
        Design §Architecture Decisions "Request-pane raw").
      Pin `CAPTURE_REDACTION_MARKER` to the exact literal
      `{"error":"response body redacted"}` in its own assertion so a backend
      drift fails loudly here.
      Satisfies: activity-network-transactions "Honest Request And Response Body
      Panes" (all 6 scenarios).
- [x] **3.4** [TDD-RED] [P] Add `toTransactionRow`/`toTransactionDetail` cases:
      a row with `httpStatus` → `hasHttpStatus === true`; a `pending` row with
      no `httpStatus` → `hasHttpStatus === false`; a `ws_broadcast`/`pushed` row
      with no `httpStatus` → `hasHttpStatus === false`; every row carries
      `outcomeColor`. Assert the same row mapped for the table and for the
      detail yields the **same** `statusColor`/`outcomeColor`.
      Satisfies: activity-network-transactions "Statusless Rows MUST NOT
      Fabricate An HTTP Status" (scenarios 1-2), "Transaction Detail Inspector"
      (header-pills-match-row scenario).
- [x] **3.5** [TDD-GREEN] Implement in
      `transaction-panel.constants.ts`: `CAPTURE_REDACTION_MARKER` (with a JSDoc
      comment naming `internal/observability/requestcapture/telemetry.go` as its
      source of truth), `TRANSACTION_RESPONSE_NOT_CAPTURED_NOTICE` (states that
      response bodies are captured only for error responses),
      `TRANSACTION_RESPONSE_REDACTED_NOTICE` (names all three causes; never says
      "truncated"), `TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE`, and the standing
      sanitized-projection note. Depends on: 3.1, 3.2, 3.3, 3.4.
- [x] **3.6** [TDD-GREEN] [S] Implement in `transaction-panel.types.ts`:
      `TransactionBodyViewModel`; add `outcomeColor: HeroChipColor` and
      `hasHttpStatus: boolean` to both view models; change `requestPayload` and
      `responseBody` from `string` to `TransactionBodyViewModel`. All
      `readonly`, all JSDoc'd. Depends on: 3.5.
- [x] **3.7** [TDD-GREEN] [S] Implement in `transaction-panel.helpers.ts`:
      `getTransactionOutcomeColor`, `toTransactionBody`, the `hasHttpStatus`
      flag, and the widened `getTransactionStatusColor` (4xx → `danger`).
      **Rewrite `getTransactionStatusColor`'s doc comment** — it currently cites
      the superseded `activity-devtools-network-view` mapping, and a stale
      comment is a lint-visible lie (Design §Drift 1). **Delete** the
      `detail.responseBody ?? TRANSACTION_NOT_CAPTURED_LABEL` string hack
      (Design §Drift 2); `TRANSACTION_NOT_CAPTURED_LABEL` survives only as
      notice copy. Depends on: 3.6.
- [x] **3.8** [S] `bun --cwd="frontend" run typecheck && lint && test` +
      `filesize:warning`. `transaction-panel.helpers.ts` projected ~195 lines
      (from 133); if it crosses 400, split the **body** helpers into a colocated
      `transaction-body.helpers.ts` and keep the pill mappings next to the view-
      model builders that consume them. Depends on: 3.7.

## Group 4 — Wire pills and CodeBlock into the view [S after Groups 2 and 3] — PR #2

- [x] **4.1** [TDD-RED] Extend
      `frontend/src/features/network/ui/TransactionTable/__tests__/TransactionTable.test.tsx`:
      a `rejected` row renders an outcome pill distinguishable from an
      `accepted` row's; a row with `hasHttpStatus: false` renders **no** status
      chip and shows the neutral absence marker instead; the rendered output
      contains neither `'0'` nor `'200'` for that row.
      Satisfies: activity-network-transactions "Transaction List View"
      (outcome-pill scenario), "Statusless Rows MUST NOT Fabricate An HTTP
      Status" (scenarios 1-2).
- [x] **4.2** [TDD-RED] [P] Extend
      `frontend/src/features/network/ui/TransactionDetail/__tests__/TransactionDetail.test.tsx`:
      the header renders both pills with the same labels/colours the row uses;
      a statusless selection renders no status pill in the header; the Request
      and Response panes render through `CodeBlock` (toggle present for a JSON
      body, notice shown for a not-captured body, redaction notice for the
      marker).
      Satisfies: activity-network-transactions "Transaction Detail Inspector"
      (both scenarios), "Honest Request And Response Body Panes" (scenarios
      1-5).
- [x] **4.3** [TDD-GREEN] Update
      `frontend/src/features/network/ui/TransactionTable/TransactionTable.tsx`:
      outcome cell `span → <Chip color={row.outcomeColor} size="sm"
      variant="soft">{row.outcome}</Chip>`; status cell renders the `Chip` only
      when `row.hasHttpStatus`, otherwise the muted `TRANSACTION_EMPTY_LABEL`
      span. No other structural change; column widths stay as they are.
      Depends on: 4.1.
- [x] **4.4** [TDD-GREEN] [S] Update
      `frontend/src/features/network/ui/TransactionDetail/TransactionDetail.tsx`:
      header outcome `span → Chip`; status `Chip` conditional on
      `hasHttpStatus`. Keep the existing `CloseButton`/`Tabs` structure.
      Depends on: 4.3.
- [x] **4.5** [TDD-GREEN] [S] Update `TransactionDetailRequest.tsx` and
      `TransactionDetailResponse.tsx`: replace each `<pre>` with `<CodeBlock />`
      fed by the `TransactionBodyViewModel`; change the inline prop types from
      `string` to `TransactionBodyViewModel`; add the standing sanitized-
      projection note to the Response pane. **Update both components' JSDoc** —
      `TransactionDetailResponse`'s current comment documents the removed
      "'Not captured' fallback" behaviour (Design §Drift 3).
      Depends on: 4.4.
- [x] **4.6** [S] Update
      `frontend/src/features/network/ui/TransactionPanel/__tests__/use-transaction-panel.test.ts`
      for the new view-model shape only. The hook's behaviour (loading,
      filtering, selection, tab reset, runtime push, elapsed clock) MUST be
      unchanged — assert that explicitly rather than rewriting the expectations.
      Depends on: 4.5.
- [x] **4.7** [S] `bun --cwd="frontend" run typecheck && lint && test` +
      `filesize:warning`. Depends on: 4.6.

## Group 5 — Docs and learning log [S, last] — PR #2

- [x] **5.1** Append one line to `docs/learning-log.md` (project rule 15)
      recording the non-obvious finding: the capture pipeline has **no**
      truncation signal — `capturingResponseWriter` cuts at 4 KB, and both a
      non-JSON body and an over-2 KB sanitized body collapse to the same
      `{"error":"response body redacted"}` literal — so the UI labels such
      content as *redacted* (cause unknowable) and never as *truncated*; and
      that response bodies are captured only for `status >= 400`, so a 2xx
      transaction legitimately has none.
      Satisfies: activity-network-transactions "Honest Request And Response Body
      Panes" (documentation of the decision).
- [x] **5.2** [S] **No** `docs/openapi.yaml` change: this slice touches no REST
      or WS wire field, no capture schema, and no MCP tool. Verify that claim
      with a diff review of `internal/**` (must be empty) before skipping the
      announcement — the project convention is to announce wire-adjacent
      changes, and "verified none" is the discharge, not silence.
      Depends on: 5.1.

## Group 6 — Final verification (orchestrator-owned, not this executor)

- [ ] **6.1** Full `bun --cwd="frontend" run typecheck && lint && test`,
      `bun --cwd="frontend" run filesize:warning`, `go test ./...` and
      `go run ./tools/checkgofilesize` (expected untouched but must stay green),
      plus a repo-wide check that no hex/oklch colour literal and no
      `dllm-network` CSS entered `frontend/src`. Then a runtime smoke test in
      `wails dev`: open Activity, confirm (a) a 4xx row's status pill is red and
      its outcome pill readable, (b) an in-flight row shows an outcome pill and
      **no** status pill, (c) a captured JSON body toggles Pretty/Raw and Copy
      pastes the compact raw form, (d) a 2xx transaction's Response pane shows
      the not-captured notice with its reason. MUST be run by the orchestrating
      agent per project rule 3, not delegated, and the commit MUST be created
      before reporting verified (project rule 4; allow ≥ 5 min for the
      pre-commit gate).

---

## Requirement Coverage Map

| Spec Requirement | Tasks |
|---|---|
| shared-ui-code-block: JSON-Only View Toggle | 1.1, 1.2, 2.1, 2.2 |
| shared-ui-code-block: Pretty And Raw Rendering Fidelity | 1.1, 1.2, 2.1 |
| shared-ui-code-block: Copy Always Copies The Raw Text | 1.4, 1.5 |
| shared-ui-code-block: Copy Confirmation Is Transient And Self-Clearing | 1.4, 1.5, 2.2 |
| shared-ui-code-block: Honest Not-Captured State | 2.1, 2.2 |
| shared-ui-code-block: Honest Redacted State | 2.1, 2.2, 3.5 |
| shared-ui-code-block: Dumb Presentational Boundary | 2.2, 2.3, 2.4 |
| activity-network-transactions: Transaction List View (MODIFIED) | 4.1, 4.3 |
| activity-network-transactions: Transaction Detail Inspector (MODIFIED) | 3.4, 4.2, 4.4, 4.5 |
| activity-network-transactions: HTTP Status Pill Colour By Class | 3.1, 3.7 |
| activity-network-transactions: Outcome Pill Over The Real Capture Vocabulary | 3.2, 3.7, 4.3 |
| activity-network-transactions: Statusless Rows MUST NOT Fabricate An HTTP Status | 3.4, 4.1, 4.3, 4.4 |
| activity-network-transactions: Honest Request And Response Body Panes | 0.2, 3.3, 3.5, 4.2, 4.5, 5.1 |

## Parallelization Summary

- **Sequential backbone**: Group 0 → (1 → 2 ‖ 3) → 4 → 5 → 6.
- **Two independent lanes**: Groups 1-2 (`shared/ui/CodeBlock`) and Group 3
  (`TransactionPanel` view models) touch disjoint files and can be built
  concurrently. Group 4 is the single join point and needs both.
- **Parallel-safe within groups**: 3.1/3.2/3.3/3.4 (four independent RED
  additions to one test file — coordinate as one edit if a single writer owns
  the lane), and 4.1/4.2 (two independent render test files).
- **Hard ordering constraint**: `CodeBlock` (Groups 1-2) MUST be green and
  barrelled before Group 4 imports it; the view models (Group 3) MUST be green
  before Group 4 renders them.
- **Behaviour-changing boundary**: Group 3 task 3.7. Everything before it is
  additive; that task flips a shipped colour mapping (4xx `warning → danger`)
  and removes the `'Not captured'`-as-body-string hack. Flag it explicitly in
  PR #2's description, not only in the learning log.
