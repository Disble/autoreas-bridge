# Mobile Cover Endpoint Specification

## Purpose

Define the complete contract of `GET /api/animes/{id}/cover`, the endpoint mobile clients use
to fetch an anime's cover thumbnail: its evaluation order, every status/header outcome,
304/ETag revalidation, `Retry-After` rules, and its OpenAPI documentation.

## Requirements

### Requirement: Evaluation Order Determines The Response

The endpoint MUST evaluate a request in this order and answer with the first matching row:

| Order | Condition | Response |
|---|---|---|
| 1 | Method is not GET (HEAD included) | 405 |
| 2 | Bearer authentication fails | 401 |
| 3 | Anime id is unknown (a soft-deleted anime still resolves) | 404 |
| 4 | The anime lookup fails for a reason other than "not found" | 503, no `Retry-After` |
| 5 | Cover is empty, `"null"`, a missing local file, not a decodable image, over 10 MB, over 16 megapixels, an ICO/SVG/BMP file, or the origin returns a 4xx status other than 408 | 204, no body |
| 6 | Origin times out or returns a network error, a 5xx status, 429, or 408; local file unreadable for a reason other than missing; or generation is saturated | 503, `Retry-After` when estimable |
| 7 | `If-None-Match` matches the current ETag | 304, no body |
| 8 | None of the above | 200, `image/jpeg`, `Content-Length`, `ETag` |

#### Scenario: HEAD is rejected before authentication

- GIVEN a HEAD request to `/api/animes/{id}/cover`
- WHEN the endpoint evaluates it
- THEN the response is 405

#### Scenario: PATCH on the cover path is rejected, not routed to the anime update handler

- GIVEN a PATCH request to `/api/animes/{id}/cover`
- WHEN the endpoint evaluates it
- THEN the response is 405
- AND the targeted anime's stored fields are unchanged

#### Scenario: A soft-deleted anime with a cover still answers 200

- GIVEN a soft-deleted anime that has a resolvable, valid cover
- WHEN a device requests its cover
- THEN the response is 200, not 404

#### Scenario: An anime-lookup infrastructure failure answers 503 without Retry-After

- GIVEN the anime lookup fails for a reason other than "not found"
- WHEN a device requests that anime's cover
- THEN the response is 503
- AND no `Retry-After` header is present

#### Scenario: An origin timeout answers 503

- GIVEN the anime's cover is a URL whose origin request times out with status 408
- WHEN a device requests its cover
- THEN the response is 503

#### Scenario: An origin 403 answers 204, not 503

- GIVEN the anime's cover is a URL whose origin returns 403
- WHEN a device requests its cover
- THEN the response is 204 with no body

#### Scenario: A source over the pixel cap answers 204

- GIVEN the anime's cover decodes to more than 16,777,216 pixels
- WHEN a device requests its cover
- THEN the response is 204 with no body

### Requirement: 304 Revalidation Uses A Strong ETag

WHEN a request's `If-None-Match` header matches the current thumbnail's ETag, the system MUST
respond 304 with that `ETag` header and no body; otherwise it MUST fall through to the
remaining evaluation order.

#### Scenario: A matching If-None-Match yields 304

- GIVEN a cached thumbnail with ETag `"abc123"`
- WHEN a request carries `If-None-Match: "abc123"`
- THEN the response is 304 with no body
- AND the response carries `ETag: "abc123"`

#### Scenario: A stale If-None-Match yields a fresh 200

- GIVEN a cached thumbnail with ETag `"abc123"` and a request carrying `If-None-Match: "old"`
- WHEN the endpoint evaluates the request
- THEN the response is 200 with the full body and `ETag: "abc123"`

### Requirement: Retry-After Reflects Estimable Delay

| Cause | `Retry-After` |
|---|---|
| Generation is saturated | 5 |
| Origin returns 429 or 503 with its own `Retry-After` | origin's value, clamped to 1-3600 |
| Any other transient failure | omitted |

#### Scenario: Saturation answers 503 with a 5-second Retry-After

- GIVEN thumbnail generation is saturated
- WHEN a device requests a cover
- THEN the response is 503 with `Retry-After: 5`

#### Scenario: An origin Retry-After above the ceiling is clamped

- GIVEN the origin returns 429 with `Retry-After: 9000`
- WHEN a device requests that cover
- THEN the response is 503 with `Retry-After: 3600`, not 9000

#### Scenario: A timeout omits Retry-After

- GIVEN the origin times out and declares no `Retry-After`
- WHEN a device requests that cover
- THEN the response is 503 with no `Retry-After` header

### Requirement: The Endpoint Is Documented With A Mobile Consumer Note

`docs/openapi.yaml` MUST document `GET /api/animes/{id}/cover`, its 200/204/304/401/404/405/503
responses, and the `ETag`, `Content-Length`, and `Retry-After` headers. It MUST include a dated
consumer note stating that a 204 response is a placeholder revalidated after 7 days, a 404
response is a placeholder revalidated after 24 hours, and that a bridge predating this change
answers 404 for every cover request because the path falls through to the existing
anime-by-id handler.

#### Scenario: OpenAPI documents the mobile consumer note

- GIVEN `docs/openapi.yaml` after this change
- WHEN a reader inspects the `/api/animes/{id}/cover` path description
- THEN it states the 7-day 204 guidance, the 24-hour 404 guidance, and the older-bridge 404
  fallback note
