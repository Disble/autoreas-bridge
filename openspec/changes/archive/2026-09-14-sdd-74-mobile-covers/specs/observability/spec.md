# Delta for Observability

## ADDED Requirements

### Requirement: Image Response Bodies Are Omitted From Capture, Not Their Metadata

When the capture middleware captures a response whose `Content-Type` header begins with
`image/`, the system MUST record the response's status, headers (including `ETag`), and
duration as usual, MUST NOT store any response body bytes, and MUST record the response body
state as `omitted_binary`.

#### Scenario: An image response is captured without its body

- GIVEN a request whose response has `Content-Type: image/jpeg` and status 200
- WHEN the capture middleware records the response
- THEN the captured row's response body is empty
- AND its response body state is `omitted_binary`

#### Scenario: Status and headers are still captured for an omitted image body

- GIVEN the same `image/jpeg` response
- WHEN the capture row is read back
- THEN its HTTP status, `ETag` header, and duration are present and correct
