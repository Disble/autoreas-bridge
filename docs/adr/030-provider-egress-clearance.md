# ADR-030: Provider egress passes through the Cloudflare clearance transport

- **Status**: Accepted (owner approval on 2026-10-23; implementation on `feat/cfclearance-provider-egress`).
- **Date**: 2026-10-23.
- **Related**: ADR-029 (mirror host chain, kept as the last resort), ADR-018 (composition root), ADR-017
  (port naming), `internal/cfclearance` (the context), `internal/cfclearance/webview2` (the engine adapter),
  `odd/tasks/cfclearance-provider-egress.md` (the feature record).

## Context

On 2026-10-22 jkanime.net placed its whole domain behind a Cloudflare managed challenge. ADR-029 kept the
app working through the site's mirrors, which is a fallback, not a solution: the owner rejected mirrors as
the answer and the mirrors can be challenged too.

A competition between three isolated proofs of concept established, with live measurements while the
challenge was active, that:

- Go's `net/http` is accepted by the edge after a challenge when it sends the issued `cf_clearance` cookie
  together with the exact User-Agent of the engine that earned it. The same cookie with the adapter's own
  User-Agent is refused.
- A WebView2 engine in a window that is never shown clears the challenge unattended in 6 to 11 seconds.
  Headless engines never clear it, and TLS fingerprint impersonation (Chrome and Firefox profiles over
  HTTP/2) is refused. An interactive Turnstile cannot be cleared without a user and must stay a failure.
- A bundled Chromium works, but it costs about 830 MiB, routes every request through a serialized renderer,
  and its origin guard disables the ADR-029 chain. go-webview2 calls `os.Exit` on about thirty internal error
  paths, so the engine must not run inside the application process.

The competition brief fixes the constraints: no user intervention, no third-party program requested from
the user, no permission outside the app, no copying of browser cookies, everything transparent and
packaged inside the app.

The provider adapters already accept an injected `*http.Client` (`jkanime.New(client)`,
`jkanime.NewSearcher(client)`); the composition root passes `nil` three times and `http.DefaultClient` once.
That seam is the port this decision uses.

## Decision

1. **A new bounded context, `internal/cfclearance`**, owns everything about clearing a Cloudflare managed
   challenge. It imports only the standard library, `golang.org/x/net/publicsuffix` and
   `internal/events`. It never imports `internal/download`, `internal/season`, `internal/anime`,
   `internal/desktop` or the Wails runtime; a depguard entry enforces that.
2. **The inbound port is `http.RoundTripper`.** `cfclearance.Transport` implements it. Provider adapters keep
   accepting a `*http.Client` and learn no new type. They stop building their own client: a
   `tools/checkarchitecture` rule refuses `http.DefaultClient` and `&http.Client{` under
   `internal/download/sites/`. The composition root builds one shared client and injects it at every
   provider construction site.
3. **Three driven ports**, named per ADR-017: `Solver` (`Solve(ctx, origin, rejected) (Clearance, error)`),
   `ClearanceStore` (`Load`, `Save`, `Delete` by registrable domain) and `Publisher` (`Publish(events.Event)`).
   The adapters are `webview2.ProcessSolver` on Windows and `UnsupportedSolver` elsewhere, `MemoryStore` in
   this release, and the in-memory `events.Bus`.
4. **The engine runs out of process.** `ProcessSolver` relaunches the application's own executable with
   `--cfclearance-solve <origin> <rejected> <dataDir> <timeout>`. `main.go` handles that flag before
   `wails.Run`, so the child never takes the single-instance lock and never creates the application window.
   The child opens a WebView2 in a `WS_POPUP` tool window that is never shown, waits for a fresh
   `cf_clearance` through `ICoreWebView2CookieManager::GetCookies`, prints one JSON line with the cookies and
   `navigator.userAgent`, and exits. A Windows job object and `cmd.WaitDelay` make sure no engine process
   outlives the child. The engine profile persists under `%LOCALAPPDATA%\autoreas-bridge\cf-webview2`.
5. **The transport acts only on a challenge** (`403`/`503` with `Cf-Mitigated: challenge`, or a `2xx` HTML
   interstitial carrying `just a moment` or `cf_chl_opt`; a bare `403` is the site's real answer). It stores
   only `cf_clearance` and `__cf*` cookies, replays with the engine's User-Agent, solves once per registrable
   domain at a time, allows at most two solves per request (a stale stored clearance, then a fresh challenge),
   one solve process-wide, times a solve out at 30 seconds, and opens a 10-minute cooldown for the domain
   after a failed solve. When it cannot help it returns the original response unchanged, so ADR-029's chain
   continues exactly as before: mirrors remain the last resort, never the first.
6. **Observability through events.** `clearance.challenge_detected`, `clearance.solved` and
   `clearance.failed` carry the domain, the duration, the attempt and the reason. A cookie value never leaves
   the transport. There is no user-facing prompt, toast or setting: the brief asked for transparency.
   A bus event alone reaches neither Activity nor the request MCP, so the transport also writes each one
   through the shared `logger.Logger` port, a required dependency, into `runtime_events` under domain
   `clearance` with the event name as its type: detected and solved at info, failed at warn with its cause.
   The jkanime adapter and searcher take the same port and write `jkanime.host_fallback` (warn, from and to
   host) each time ADR-029's chain moves to a mirror. The Where value `providers` reads both domains.

## Consequences

- A first challenged request costs one hidden solve, measured at 6 to 11 seconds; later requests cost one
  cookie header. A failed solve costs at most 30 seconds once per domain per cooldown window, after which the
  mirrors answer as today.
- `main.go` gains one call before `wails.Run`. ADR-018 said the root keeps "`main.go` and nothing else"; it
  still does, and that file now does two things instead of one. This ADR records the second.
- `github.com/wailsapp/go-webview2` becomes a direct dependency at the version Wails already pins. No new
  runtime ships; the installer and CI are untouched.
- Other platforms get `UnsupportedSolver` and behave exactly as 2.3.1.
- Coverage tiers: the `internal/cfclearance` decisions are CORE (full coverage, mutation survivors killed or
  proven equivalent); the engine adapter is IMPORTANT (behaviour covered by a Windows-tagged fixture test);
  wiring is INFRASTRUCTURE.
- The next live challenge is the real exam. No live challenge has been served since 2026-10-23 00:38, so the
  clearance path is proven against a local fixture that mimics the cookie protocol, plus the measurements
  recorded during the competition.

## Rejected

- **Bundled Chromium transport**: every request through a browser, about 830 MiB, the mirror chain silently
  disabled by its origin guard. Its one genuine discovery, a permissionless MV3 service worker that lets a
  headful Chromium open a hidden target, is kept on record as the fallback engine behind the `Solver` port if
  Cloudflare ever stops accepting WebView2.
- **In-process WebView2**: go-webview2 exits the process on its internal errors.
- **TLS fingerprint impersonation**: refused on HTTP/2 for every tested profile; the challenge needs
  JavaScript, not a handshake.
- **Mirrors as the solution**: rejected by the owner; they stay as the fallback (ADR-029).
- **Any path that asks the user** for cookies, a browser, a permission or a click.
- **Persisting the clearance in SQLite now**: the engine profile already keeps the cookie, and a restart
  re-solves in under a second. A `cf_clearances` table with its owned-table rule is a later slice, taken only
  if a measured startup shows the solve matters.
