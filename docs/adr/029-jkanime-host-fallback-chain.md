# ADR-029: jkanime requests fall back along a mirror host chain on a Cloudflare challenge

- **Status**: Accepted.
- **Date**: 2026-10-23.
- **Related**: `internal/download/sites/jkanime/hosts.go` (the chain), `internal/download/sites/jkanime/jkanime.go`
  (episode listing and link extraction), `internal/download/sites/jkanime/search.go` (season name search).

## Context

On 2026-10-23 every download run failed with the same error for every anime:

```
list episodes failed: jkanime: fetch anime info: GET https://jkanime.net/kyoufu-collector/: HTTP 403
```

The site was reachable from a browser and answered `ping`. `ping` is ICMP, so it only proves the host is up.
Every HTTP request to `jkanime.net` answered:

```
HTTP/1.1 403 Forbidden
Server: cloudflare
Cf-Mitigated: challenge
```

That is Cloudflare's managed challenge. It lets a client through only after the client runs the challenge's
JavaScript. A browser does that and keeps the `cf_clearance` cookie, but Go's `net/http` cannot. The challenge covered
the whole domain, including `robots.txt`, `sitemap.xml`, `/feed/`, `/buscar/`, `/ajax/episodes/` and `cdn.jkanime.net`. The
User-Agent made no difference: the response was the same with no UA, Go's UA, and the Chrome UA the adapter sends.

We assume the challenge is permanent. Sites rarely lift one, and the bridge must not wait for it.

## Evidence

Measured live on 2026-10-23:

| Probe | Result |
|---|---|
| `jkanime.net`, any path, any User-Agent | 403 `Cf-Mitigated: challenge` |
| `jkanime.org` and `jkanime.bz`, home page | 200, same site; pages link to `login.jkanime.net` |
| Mirror: anime page → CSRF + `data-anime` → `POST /ajax/episodes/{id}/{page}` → `var servers` | Works; same anime IDs on both mirrors |
| The unchanged adapter, with requests rewritten to each mirror, on the 4 anime that failed | 4/4 on `.org`, 4/4 on `.bz`, same links; ~0.8 s per anime |
| A Mediafire link extracted from a mirror | 200, and the file title matches the episode (not decoy content) |
| `/buscar/` on a mirror | Result links point at the mirror's own host (`https://jkanime.org/...`) |

The probe program lived on the throwaway branch `poc/jkanime-mirror` (`cmd/poc-jkmirror`), never merged.

## Alternatives considered

Ordered from lightest to heaviest. A headless browser is the last resort.

1. **Mirror host chain** (chosen). Measured working, and it needs no new dependency. The risk is that the
   mirrors get the same challenge.
2. **TLS/HTTP2 fingerprint impersonation** (utls, tls-client). Not adopted: a managed challenge requires
   JavaScript execution, and impersonating a handshake does not produce the clearance token.
3. **Reuse the browser's `cf_clearance` cookie.** Fragile: it expires, and it is bound to the User-Agent and IP that solved it.
4. **A challenge solver service (Byparr, FlareSolverr) or a driven browser (chromedp + Edge).** Solves the challenge,
   but adds a browser process to every run. This is the last resort, for when every mirror is challenged too.

## Decision

The jkanime adapter and the season searcher send every operation along the chain `https://jkanime.net` →
`https://jkanime.org` → `https://jkanime.bz`.

- **Only a challenge moves on.** A response counts as a challenge only when it is HTTP 403 **and** carries
  `Cf-Mitigated: challenge`. Any other failure, including a plain 403, is the site's real answer and surfaces unchanged.
- **One host per operation.** An episode listing runs its page GET and its CSRF-bound AJAX POST on the same host. A
  challenge moves the whole listing to the next host, because a token from one host is not valid on another.
- **The order restarts every time.** Every operation starts at `jkanime.net`, and no host is remembered. If the challenge
  is lifted the chain heals without a release; the cost is one extra 403 per operation while it lasts.
- **The stored identity stays canonical.** Stored anime page URLs stay on `jkanime.net`. The episode URL a listing
  returns keeps the caller's host, and search results that a mirror returns on its own host are rewritten to
  `jkanime.net`. Which mirror answered never changes the stored `pagina`.
- **The Referer follows the host.** Each request carries a Referer on the host it is sent to.
- **An exhausted chain fails loudly.** When every host is challenged the error names every host tried and wraps
  the last challenge, so the download run fails the way it did before, with a clearer message.
- **Unknown hosts run once.** A page URL on a host outside the chain is fetched as given, once.
- **Errors name the host that answered.** When a mirror returns a real error (a 404, a template drift), the
  message carries the mirror's URL, e.g. `GET https://jkanime.org/<slug>/999/: HTTP 404`, not the stored
  `jkanime.net` URL. That is the request that actually failed.

## Consequences

- Downloads and the season name search work again with no change to callers, the wire contract or stored data.
- `Matches` also accepts `jkanime.org` page URLs.
- If the mirrors are challenged too, the error says so and option 4 above is the next step.
- A mirror that disappears or changes its template fails like jkanime.net does today: a loud error, never silent success.
