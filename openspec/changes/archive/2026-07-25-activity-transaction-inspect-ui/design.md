# Design: Activity Transaction Inspect UI

## Technical Approach

Two independent frontend slices over the already-shipped `TransactionPanel` subtree. No Go file, no capture schema, no wire contract, no new dependency.

**Slice A — `shared/ui/CodeBlock`.** A new folder-owned shared primitive that renders read-only text with an optional Pretty/Raw switch, a copy-raw action with a self-clearing confirmation, and three explicit content states (`captured` / `not-captured` / `redacted`). All parsing/formatting is pure; all state and the confirmation timer live in `use-code-block.ts`; the `.tsx` is dumb HeroUI. The transaction detail's Request and Response panes become its first consumers.

**Slice B — pills.** No new component: HeroUI `Chip` is already the project's badge primitive (`autoreas-theme` → "Tag / badge → `Chip`") and is already used for the status cell. The work is semantic — one new pure mapping (`getTransactionOutcomeColor`), one widened mapping (`getTransactionStatusColor`), one new view-model flag (`hasHttpStatus`), and rendering a second `Chip` in the two existing consumers.

## Architecture Decisions

| Area | Choice | Alternative | Rationale |
|---|---|---|---|
| Pill component | Reuse HeroUI `Chip` directly at both call sites | New `shared/ui/StatusPill` / `OutcomePill` wrappers | `shared/ui/**` holds no pill primitive today and `Chip` already carries `color`/`size`/`variant`. A wrapper over a one-prop mapping is duplication, not abstraction. What must be shared is the **mapping**, and that lives in the existing `transaction-panel.helpers.ts`. |
| Colour source | `color="success \| warning \| danger \| accent \| default"` semantic tokens only | Port `dllm-network`'s CSS/hex | Project rule and `autoreas-theme` §Brand: port the *role* a colour plays, never the literal hue. A hardcoded hex here would be the exact SDD-38 regression the theme skill records. |
| Statusless rows | View-model flag `hasHttpStatus`; the status `Chip` is conditionally rendered, falling back to the existing `TRANSACTION_EMPTY_LABEL` (`–`) as muted text | Render a `–` chip / render `0` / colour it `default` | A grey chip still reads as "a status exists and it is unremarkable". Absence of the chip is the honest signal; the outcome pill carries the meaning. |
| Statusless detection | `httpStatus === undefined` | Infer from `kind` (`ws_connect`/`ws_broadcast`/…) or from `outcome === 'pending'` | The DTO field is the fact; `kind` is a taxonomy that will grow. One rule covers pending arrival rows and every hub frame without enumerating them. |
| `CodeBlock` state model | Caller passes a discriminated `state` plus optional `notice` copy; `CodeBlock` owns no domain knowledge | `CodeBlock` sniffs the redaction marker itself | The marker is a capture-pipeline fact, not a code-viewer fact. Keeping the sniff in `transaction-panel.helpers.ts` keeps `shared/ui` domain-free and reusable. |
| Redaction detection | Exact equality against one mirrored constant of `redactedResponseBodyMarker` | Regex/substring match, or a new backend `truncated` flag | The Go value is a `const` literal; exact equality is the tightest possible test and degrades safely (renders the JSON verbatim) if it ever drifts. A backend flag is explicitly out of scope. |
| Truncation wording | Never say "truncated"; say "redacted by the capture pipeline" and name all possible causes | A "Truncated" badge | The three causes are provably indistinguishable after the fact (see §Truncation honesty). Claiming one would be a fabricated fact. |
| Copy confirmation | Inline transient label on the Copy button, timer in the hook with `clearTimeout` on unmount | `toast.success(...)` (the project's clipboard convention) | The theme skill's toast convention is for one-off desktop actions. `CodeBlock` is a shared primitive that can render several times per view; a toast per copy is noise, and an inline confirmation is the affordance the port asks for. Recorded here as a deliberate, scoped exception. |
| JSON detection | `JSON.parse` succeeds **and** the result is a non-null `object` (covers arrays) | Any successful `JSON.parse` | `JSON.parse("123")` succeeds; pretty-printing a scalar produces the same string and the toggle would be a no-op control that lies about there being two views. |
| Request-pane "raw" | Compact `JSON.stringify(payload)` | Keep the existing 2-space form as "raw" | `CaptureDetail.payload` arrives already parsed as an object — there is **no** server-verbatim string for the request pane. Compact serialization is the closest honest "raw" and makes Pretty/Raw a real distinction. Documented as an asymmetry, not hidden. |

## Truncation honesty — the evidence

Read directly from runtime code (CLAUDE.md rule 2: code wins).

1. `internal/api/capture_middleware.go:151` — `capturingResponseWriter.Write` retains at most `maxCapturedResponseBodyBytes = 4096` bytes and **silently drops the remainder**. No flag is recorded.
2. `internal/api/capture_middleware.go:97` — `SanitizeResponseBody` is called **only** when `status >= 400 && len(body) > 0`. A 2xx transaction therefore has `ResponseBody == nil` **by design**.
3. `internal/observability/requestcapture/telemetry.go:91-121` — `sanitizeResponseBodyWithConfig`:
   - `json.Unmarshal` failure → returns the literal `{"error":"response body redacted"}`;
   - success → keeps only the keys in `{error, status, message, conflict, code, kept_grade}` and drops everything else, silently;
   - re-marshaled result over `MaxResponseBodyKB * 1024` (2 KB) → the **same** literal marker.

Consequences the UI must respect:

- **There is no truncation flag and none can be derived.** A 4 KB-cut body, a non-JSON body, and an over-2 KB sanitized body all produce one identical string. Any "Truncated" badge would be a guess presented as a fact.
- **Decision**: detect the marker by exact equality and render a *redaction* notice whose copy names all three causes ("not JSON, over the 2 KB sanitized cap, or cut at the 4 KB capture cap"). This is derived from real constants, invents nothing, and is falsifiable by a test that pins the literal.
- **Decision**: the not-captured notice for a 2xx transaction states that response bodies are only captured for error responses, so the absence reads as expected rather than as a fault.
- **Accepted limitation, documented not hidden**: a *captured* body is a key-allowlisted projection of the wire body. The response pane carries a standing one-line note to that effect; the UI never claims completeness.

## Outcome vocabulary — the evidence

Grepped from runtime code, not from docs:

| Outcome | Written by | Token | Role |
|---|---|---|---|
| `pending` | `capture_middleware.go` arrival row (`BuildTransportCaptureRecord` default), and any terminal row the handler never enriched | `accent` | in flight / active |
| `accepted` | `sync_handler.go:66`, `anime_handler.go:69`, `websocket_handler.go:193` | `success` | completed successfully |
| `rejected` | `sync_handler.go:74`, `anime_handler.go:56,62`, `websocket_handler.go:202` | `danger` | refused / failed operation |
| `malformed` | `sync_handler.go:44`, `anime_handler.go:51` | `warning` | client sent an unusable payload — attention, not a bridge failure |
| `opened` | `realtime/hub_capture.go:24` (`ws_connect`) | `accent` | connection live |
| `closed` | `realtime/hub_capture.go:30` (`ws_disconnect`) | `default` | neutral terminal lifecycle |
| `pushed` | `realtime/hub_capture.go:38` (`ws_broadcast`) | `success` | one-way frame delivered |
| anything else | — | `default` | Null Object; label rendered verbatim |

**There is no derived `stale` capture outcome.** `DeviceSyncStatusStale` (`internal/sync/changelog_store.go`) is device-sync status on a different entity and MUST NOT be mixed into this pill.

## Data Flow

    CaptureRow / CaptureDetail (DTO, shared/contracts/capture.types.ts)
        │
        ▼
    transaction-panel.helpers.ts   ── pure
        ├─ getTransactionStatusColor(httpStatus)      → HeroChipColor
        ├─ getTransactionOutcomeColor(outcome)        → HeroChipColor
        ├─ toTransactionBody(raw, kind)               → TransactionBodyViewModel
        └─ toTransactionRow / toTransactionDetail     → + outcomeColor, hasHttpStatus, bodies
        │
        ▼
    use-transaction-panel.ts (unchanged wiring; memoized view models)
        │
        ▼
    TransactionTable.tsx / TransactionDetail.tsx   ── Chip x2
    TransactionDetailRequest.tsx / …Response.tsx   ── <CodeBlock {...body} />
                                                        │
                                          use-code-block.ts  ── view state + copy + 1.5s timer
                                                        │
                                          code-block.helpers.ts ── parse / pretty (pure)

## Interfaces / Contracts

### `frontend/src/shared/ui/CodeBlock/code-block.types.ts`

```ts
/** Which content state a CodeBlock is rendering. */
export type CodeBlockState = 'captured' | 'not-captured' | 'redacted';

/** Which of the two views is showing; 'raw' is the only view for non-JSON text. */
export type CodeBlockView = 'pretty' | 'raw';

export interface CodeBlockProps {
  readonly label: string;             // pane title, e.g. "Body"
  readonly raw: string;               // verbatim source text; '' when state !== 'captured'
  readonly state: CodeBlockState;
  readonly notice?: string;           // caller-owned copy for not-captured / redacted
  readonly ariaLabel?: string;
}
```

### `frontend/src/shared/ui/CodeBlock/code-block.helpers.ts` (every export JSDoc'd)

```ts
/** Reports whether raw parses as a JSON object or array (scalars are NOT JSON here). */
export function isJsonCodeText(raw: string): boolean;

/** Returns JSON.stringify(JSON.parse(raw), null, 2), or raw unchanged when it is not JSON. */
export function toPrettyCodeText(raw: string): string;

/** Resolves the text to display for a view, defaulting to raw when pretty is unavailable. */
export function resolveCodeText(raw: string, view: CodeBlockView): string;
```

### `frontend/src/shared/ui/CodeBlock/use-code-block.ts`

Strict hook anatomy — refs, state, derived, callbacks, effects, return:

```ts
export function useCodeBlock(raw: string): {
  readonly view: CodeBlockView;
  readonly isJson: boolean;
  readonly text: string;
  readonly isCopied: boolean;
  readonly onViewChange: (view: CodeBlockView) => void;
  readonly onCopy: () => void;
};
```

- `timerRef: useRef<number | null>(null)` — the confirmation timer handle.
- `onCopy` calls `navigator.clipboard.writeText(raw)` — **always `raw`, never `text`** — owns the rejected promise, sets `isCopied`, clears any in-flight timer, then schedules the reset with `COPY_CONFIRMATION_MS`.
- One `useEffect` returning a cleanup that clears `timerRef.current` on unmount. (The `usePairingPanel` precedent leaks its timer; do **not** copy that part.)

### `transaction-panel.types.ts` additions (all `readonly`)

```ts
/** Presentation-ready shape of one inspectable body/payload pane. */
export interface TransactionBodyViewModel {
  readonly raw: string;
  readonly state: CodeBlockState;
  readonly notice?: string;
}
// TransactionRowViewModel     += outcomeColor: HeroChipColor; hasHttpStatus: boolean
// TransactionDetailViewModel  += outcomeColor: HeroChipColor; hasHttpStatus: boolean
//                              ; requestPayload: TransactionBodyViewModel   (was string)
//                              ; responseBody:   TransactionBodyViewModel   (was string)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/shared/ui/CodeBlock/index.ts` | Create | Pure re-export barrel (`CodeBlock`, types) |
| `frontend/src/shared/ui/CodeBlock/CodeBlock.tsx` | Create | Dumb: `ToggleButtonGroup`+`ToggleButton` (Pretty/Raw), `Button` (Copy), `<pre>` body, notice block. No `useEffect`, no root-level `export const`. ~90 lines |
| `frontend/src/shared/ui/CodeBlock/use-code-block.ts` | Create | View state, copy, 1.5 s timer + unmount cleanup. ~60 lines |
| `frontend/src/shared/ui/CodeBlock/code-block.helpers.ts` | Create | `isJsonCodeText`, `toPrettyCodeText`, `resolveCodeText`. ~45 lines |
| `frontend/src/shared/ui/CodeBlock/code-block.types.ts` | Create | `CodeBlockProps`, `CodeBlockState`, `CodeBlockView`. ~30 lines |
| `frontend/src/shared/ui/CodeBlock/code-block.constants.ts` | Create | `COPY_CONFIRMATION_MS = 1500`, `CODE_BLOCK_VIEW_OPTIONS`, `COPY_IDLE_LABEL`, `COPY_DONE_LABEL`. ~25 lines |
| `frontend/src/shared/ui/CodeBlock/__tests__/code-block.helpers.test.ts` | Create | JSON detection (object/array/scalar/garbage), pretty fidelity, raw fidelity |
| `frontend/src/shared/ui/CodeBlock/__tests__/use-code-block.test.ts` | Create | Copy-raw-in-both-views, confirmation appears/clears, restart, unmount cleanup, rejected clipboard |
| `frontend/src/shared/ui/CodeBlock/__tests__/CodeBlock.test.tsx` | Create | Toggle presence/absence, not-captured notice, redacted notice, no copy in non-captured states |
| `frontend/src/features/network/ui/TransactionPanel/transaction-panel.helpers.ts` | Modify | `getTransactionOutcomeColor`, `toTransactionBody`, `hasHttpStatus`; `getTransactionStatusColor` 4xx `warning → danger`; drop the `?? TRANSACTION_NOT_CAPTURED_LABEL` string hack |
| `frontend/src/features/network/ui/TransactionPanel/transaction-panel.types.ts` | Modify | `TransactionBodyViewModel` + the four view-model fields above |
| `frontend/src/features/network/ui/TransactionPanel/transaction-panel.constants.ts` | Modify | `CAPTURE_REDACTION_MARKER`, `TRANSACTION_RESPONSE_NOT_CAPTURED_NOTICE`, `TRANSACTION_RESPONSE_REDACTED_NOTICE`, `TRANSACTION_PAYLOAD_NOT_CAPTURED_NOTICE` |
| `frontend/src/features/network/ui/TransactionTable/TransactionTable.tsx` | Modify | Outcome cell `span → Chip`; status cell conditional on `hasHttpStatus` |
| `frontend/src/features/network/ui/TransactionDetail/TransactionDetail.tsx` | Modify | Header outcome `span → Chip`; status `Chip` conditional |
| `frontend/src/features/network/ui/TransactionDetail/TransactionDetailRequest.tsx` | Modify | `<pre>` → `<CodeBlock />`, prop type `string → TransactionBodyViewModel` |
| `frontend/src/features/network/ui/TransactionDetail/TransactionDetailResponse.tsx` | Modify | Same |
| `frontend/src/features/network/ui/TransactionPanel/__tests__/transaction-panel.helpers.test.ts` | Modify | New outcome/body/status assertions; the 4xx colour expectation flips |
| `frontend/src/features/network/ui/TransactionTable/__tests__/TransactionTable.test.tsx` | Modify | Outcome chip present; no status chip for a statusless row |
| `frontend/src/features/network/ui/TransactionDetail/__tests__/TransactionDetail.test.tsx` | Modify | Header pills; `CodeBlock`-rendered panes |
| `frontend/src/features/network/ui/TransactionPanel/__tests__/use-transaction-panel.test.ts` | Modify | View-model shape only (no behaviour change in the hook) |

Nothing under `internal/**`, `cmd/**`, `docs/openapi.yaml`, or the frontend `NetworkPanel`/`NetworkDetail` subtree is touched.

## File-Size Plan

| File | Now | Projected | Note |
|---|---|---|---|
| `transaction-panel.helpers.ts` | 133 | ~195 | Well under the 400 warning. If it ever crosses 400, split the **body** helpers into `transaction-body.helpers.ts` in the same folder (strict-colocation allows a second `*.helpers.ts`) — do not split the pill mappings away from the view-model builders that use them. |
| `transaction-panel.types.ts` | 95 | ~110 | Fine |
| `CodeBlock.tsx` | — | ~90 | Fine |
| every other new file | — | < 70 | Fine |

`bun --cwd="frontend" run filesize:warning` stays advisory; ESLint's `>500` rule is the hard gate. No file in this change approaches either.

## Lint Constraints To Encode

- **`dlinter/strict-colocation`**: a root-level `export const` is forbidden in a governed main-module file (`CodeBlock.tsx`, `use-code-block.ts`) but **exempt** in `*.helpers.ts`. All shared literals therefore live in `code-block.constants.ts` / `transaction-panel.constants.ts`.
- **`dlinter/pure-index-barrel` + `folder-ownership`**: `CodeBlock/index.ts` re-exports only; it declares nothing.
- **`dlinter/no-view-effects`**: no `useEffect` in any `.tsx`, including under `shared/ui`.
- **`dlinter/readonly-props`**: every field of `CodeBlockProps` and every added view-model field is `readonly`.
- **`dlinter/hook-anatomy`**: `use-code-block.ts` orders refs → state → derived → callbacks → effects → return.
- **`jsdoc/require-jsdoc` + `dlinter/require-exported-variable-jsdoc`**: every exported helper, type, and constant carries JSDoc.
- Copy is English (project rule 13). UI copy is English (`feedback_frontend_ui_english`).

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| FE unit (helpers) | `isJsonCodeText` object/array/scalar/garbage/empty; `toPrettyCodeText` equals `JSON.stringify(parse, null, 2)`; `resolveCodeText` falls back to raw | Vitest, pure, RED first |
| FE unit (helpers) | `getTransactionStatusColor` for 200/301/404/500/100/undefined; `getTransactionOutcomeColor` for all 7 outcomes + unknown; `toTransactionBody` for captured / undefined / marker / empty-object payload | Vitest, pure, RED first |
| FE hook | `useCodeBlock`: copy writes `raw` while Pretty is active; confirmation appears and clears on fake timers; a second copy restarts the window; unmount clears the timer; a rejecting clipboard shows no confirmation and throws nothing | Vitest + `vi.useFakeTimers()`; clipboard stubbed via `Object.defineProperty(globalThis.navigator, 'clipboard', …)` (the `use-pairing-panel.test.ts` pattern) |
| FE render | `CodeBlock`: toggle present for JSON / absent for non-JSON and scalars; not-captured and redacted notices; no Copy outside `captured` | RTL; React Aria `usePress` responds to `fireEvent.click` (theme skill) — a single-select `ToggleButtonGroup` exposes `role="radio"`, so query by radio |
| FE render | `TransactionTable`: outcome chip colour per outcome; **no** status chip when `hasHttpStatus` is false | RTL over fake rows |
| FE render | `TransactionDetail`: header carries both pills; Request/Response panes delegate to `CodeBlock` | RTL |

**TDD order (strict, RED before GREEN):**
1. `code-block.helpers` tests → helpers.
2. `use-code-block` tests → hook (timer + clipboard).
3. `CodeBlock.test.tsx` → `CodeBlock.tsx` + `index.ts`.
4. `transaction-panel.helpers` tests (outcome colour, status widening, `toTransactionBody`) → helpers + types + constants.
5. `TransactionTable` / `TransactionDetail` render tests → the four `.tsx` edits.
6. Full frontend gate.

## Migration / Rollout

None. Frontend-only, no persisted state, no wire change, no Wails binding regeneration (no new bound method). Revert the commits to restore the previous rendering exactly.

## Drift (CLAUDE.md rule 2 — runtime code wins)

1. **`getTransactionStatusColor` maps 4xx → `warning`** (`transaction-panel.helpers.ts:36`) and its doc comment cites `activity-devtools-network-view`'s design line "class 2xx/3xx/4xx/5xx → success/default/warning/danger". This change deliberately moves 4xx → `danger` per the DevTools convention this port follows. The doc comment MUST be rewritten (a stale comment citing the superseded mapping is a lint-visible lie), and the existing helper test expectation flips in the same commit.
2. **`toTransactionDetail` writes the literal string `'Not captured'` into `responseBody`** (`transaction-panel.helpers.ts:130`) — the exact conflation this change removes. `TRANSACTION_NOT_CAPTURED_LABEL` survives as *notice* copy, never as body content.
3. **`TransactionDetailResponse`'s JSDoc already claims** it renders "the response body (or its 'Not captured' fallback)", i.e. the drift is documented as intended behaviour. Update the comment alongside the code.
4. **The base capability spec still says `mobile_request_captures`** (`activity-devtools-network-view/specs/activity-network-transactions/spec.md:5,11`) and `mobilecapture.Reader`; `capture-nomenclature-rename` renamed both to `request_captures` / `requestcapture.Reader`. Pre-existing spec drift, **out of scope here** — flagged for the archive step of the rename change, not fixed by this UI change.
5. **`usePairingPanel.onCopyToken` never clears its `window.setTimeout`** (`use-pairing-panel.ts:48`), so it can set state after unmount. This design does not reuse that shape; `useCodeBlock` clears its timer. Fixing `PairingPanel` itself is out of scope.
6. **`TRANSACTION_STATUS_CLASS_FILTER_OPTIONS` already offers a `3xx` filter bucket** with no colour counterpart today; this change gives 3xx an explicit neutral token so filter and pill agree.

## Open Questions

- [ ] Should the Response pane's standing "sanitized projection" note be permanent copy or a `Tooltip` on the pane title? Assumed permanent one-line muted copy for v1 (no tooltip dependency, no hover-only information).
- [ ] `pending` → `accent` vs `warning`: assumed `accent` (active/in-progress, matching the theme's brand-accent role). Revisit only if `accent` collides visually with the live elapsed-duration treatment already shipped for pending rows.
