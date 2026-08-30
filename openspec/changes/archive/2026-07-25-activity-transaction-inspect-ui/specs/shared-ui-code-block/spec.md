# Shared UI CodeBlock Specification

## Purpose

Defines the reusable `frontend/src/shared/ui/CodeBlock` primitive: a read-only text/code viewer with an optional Pretty/Raw view switch, a copy-to-clipboard action that is always faithful to the source text, and explicit renderings for text that was never captured or was redacted upstream. It exists so no consumer hand-rolls a `<pre>` and so "no body" is never presented as "an empty body".

This capability is presentation-only. It performs no I/O other than the clipboard write, holds no domain knowledge, and never mutates or re-derives the text it is given.

## Requirements

### Requirement: JSON-Only View Toggle

`CodeBlock` MUST render a Pretty/Raw view switch **only** when its raw text parses as a JSON **object or array**. For any other input — unparseable text, or JSON that parses to a scalar (`number`, `string`, `boolean`, `null`) — the component MUST render the raw text with no view switch at all.

Detection MUST be a pure helper. The component MUST NOT attempt a second parse, a partial parse, or a repair of malformed JSON.

#### Scenario: JSON object body offers both views
- GIVEN a `CodeBlock` whose raw text is `{"status":"accepted","code":"ok"}`
- WHEN it renders
- THEN a Pretty/Raw view switch MUST be present
- AND the default selected view MUST be Pretty

#### Scenario: JSON array body offers both views
- GIVEN a `CodeBlock` whose raw text is `[{"id":1},{"id":2}]`
- WHEN it renders
- THEN a Pretty/Raw view switch MUST be present

#### Scenario: Non-JSON body offers no toggle
- GIVEN a `CodeBlock` whose raw text is `Internal Server Error`
- WHEN it renders
- THEN no Pretty/Raw view switch MUST be present
- AND the raw text MUST be displayed verbatim

#### Scenario: Scalar JSON offers no toggle
- GIVEN a `CodeBlock` whose raw text is `123`, `"text"`, `true`, or `null`
- WHEN it renders
- THEN no Pretty/Raw view switch MUST be present
- AND the raw text MUST be displayed verbatim
- AND the component MUST NOT claim the text is JSON

### Requirement: Pretty And Raw Rendering Fidelity

When both views are available, the Pretty view MUST render `JSON.stringify(parsed, null, 2)` of the parsed value and the Raw view MUST render the original string byte-for-byte. Switching views MUST NOT alter, re-order, re-encode, or lose any part of the raw text.

#### Scenario: Pretty view is two-space indented JSON
- GIVEN a `CodeBlock` whose raw text is the compact JSON `{"a":1,"b":[2,3]}`
- WHEN the Pretty view is selected
- THEN the rendered text MUST equal `JSON.stringify(JSON.parse(raw), null, 2)`

#### Scenario: Raw view is the untouched source
- GIVEN a `CodeBlock` whose raw text contains non-significant whitespace and a specific key order
- WHEN the Raw view is selected
- THEN the rendered text MUST be identical to the raw text supplied by the caller

#### Scenario: Switching views is lossless and repeatable
- GIVEN a `CodeBlock` displaying the Pretty view
- WHEN the user switches to Raw and back to Pretty
- THEN each view MUST render exactly what it rendered the first time

### Requirement: Copy Always Copies The Raw Text

The copy action MUST write the **verbatim raw** text to the clipboard via `navigator.clipboard.writeText`, regardless of which view is currently selected and regardless of whether a view switch is offered at all. It MUST NOT copy the pretty-printed form, a trimmed form, or the rendered DOM text.

#### Scenario: Copy from the Pretty view still copies raw
- GIVEN a `CodeBlock` whose raw text is the compact JSON `{"a":1}` and whose Pretty view is selected
- WHEN the user activates Copy
- THEN `navigator.clipboard.writeText` MUST be called with `{"a":1}`, not with the indented form

#### Scenario: Copy from the Raw view copies raw
- GIVEN a `CodeBlock` whose Raw view is selected
- WHEN the user activates Copy
- THEN `navigator.clipboard.writeText` MUST be called with the raw text

#### Scenario: Copy on a non-JSON body
- GIVEN a `CodeBlock` whose raw text is not JSON and therefore has no view switch
- WHEN the user activates Copy
- THEN `navigator.clipboard.writeText` MUST be called with that raw text

### Requirement: Copy Confirmation Is Transient And Self-Clearing

After a successful copy the component MUST show a visible "Copied" confirmation for approximately 1.5 seconds and then return to its idle label on its own, with no user action. The confirmation timer MUST be owned by the module's hook, MUST be cleared when the component unmounts, and MUST NOT live in the `.tsx`.

#### Scenario: Confirmation appears then clears
- GIVEN a `CodeBlock` in its idle state
- WHEN the user activates Copy and the clipboard write resolves
- THEN the confirmation MUST become visible
- AND after the confirmation window elapses the component MUST return to its idle label without further interaction

#### Scenario: Repeated copies restart the window
- GIVEN a `CodeBlock` already showing the confirmation
- WHEN the user activates Copy again
- THEN the confirmation MUST remain visible and its window MUST restart from that moment

#### Scenario: Unmount during the confirmation window
- GIVEN a `CodeBlock` showing the confirmation
- WHEN the component unmounts before the window elapses
- THEN the pending timer MUST be cleared
- AND no state update MUST be attempted after unmount

#### Scenario: Clipboard unavailable or denied
- GIVEN a runtime where `navigator.clipboard.writeText` rejects
- WHEN the user activates Copy
- THEN the component MUST NOT show the confirmation
- AND the rejection MUST be owned at the callback boundary (no unhandled rejection, no crash, no error thrown into render)

### Requirement: Honest Not-Captured State

When the caller declares the text was never captured, `CodeBlock` MUST render an explicit notice conveying that nothing was recorded, and MUST NOT render an empty or blank code area that could be read as "the body was empty". In this state no view switch MUST be offered and the copy action MUST NOT be offered.

#### Scenario: Never-captured body shows a notice
- GIVEN a `CodeBlock` in the not-captured state
- WHEN it renders
- THEN it MUST show an explicit not-captured notice supplied by the caller
- AND it MUST NOT render an empty code area
- AND no Pretty/Raw switch and no Copy action MUST be present

#### Scenario: Genuinely empty captured text is not "not captured"
- GIVEN a `CodeBlock` in the captured state whose raw text is the empty string
- WHEN it renders
- THEN it MUST NOT show the not-captured notice
- AND it MUST convey that the captured content itself was empty

### Requirement: Honest Redacted State

When the caller declares the text was redacted upstream, `CodeBlock` MUST render a redaction notice that identifies the content as bridge-generated rather than as the origin's real response, and MUST NOT present the redaction marker as if it were captured data. The component MUST NOT describe redacted content as "truncated", because the upstream sanitizer records no truncation signal and the cause is not recoverable.

#### Scenario: Redacted body is labelled, not impersonated
- GIVEN a `CodeBlock` in the redacted state
- WHEN it renders
- THEN it MUST show a redaction notice attributing the content to the capture pipeline
- AND it MUST NOT present the marker text as the origin's response body

#### Scenario: Redaction notice does not claim truncation
- GIVEN a `CodeBlock` in the redacted state
- WHEN the notice renders
- THEN it MUST NOT assert that the body was truncated
- AND it MUST allow for every possible upstream cause rather than naming one

### Requirement: Dumb Presentational Boundary

`CodeBlock` MUST be a folder-owned module whose public surface flows through a pure re-export `index.ts`. Its `.tsx` MUST contain no `useEffect`, no Wails/infrastructure call, and no parsing or formatting logic; all parsing/formatting MUST live in JSDoc'd pure helpers in `code-block.helpers.ts`, and all state and timers in `use-code-block.ts` following the project's strict hook anatomy. Every prop in `code-block.types.ts` MUST be `readonly`.

#### Scenario: Logic placement is enforced
- GIVEN the `CodeBlock` module
- WHEN the frontend architecture linter runs
- THEN no view effect, infrastructure import, or root-level exported constant in a governed main-module file MUST be reported
- AND every exported helper MUST carry JSDoc
