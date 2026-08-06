---
name: frontend-render-smoke
description: Debug a blank or non-rendering Wails window, and verify the production frontend bundle actually paints. Load when the built app opens to an empty window, when a change could stop the UI mounting, or before shipping a release.
---

# Debugging a blank Wails window

A Wails app can pass every check in this repo and still open to an empty window.
Release 1.2.0 did: `tsc` clean, 1498 tests green, gate green, installer built —
blank app.

**The reason is structural.** Every frontend check runs *source* through Vite in
jsdom. Nothing executes the *minified bundle* that gets embedded into the binary,
and nothing renders in a real browser engine.

## Rule zero

**"The process is alive" is not "the app works."**

A Wails binary logs a full, healthy Go startup — bindings, event bus, HTTP server
— with a completely blank WebView. `tasklist` showing the process, and
`[WebView2] Environment created successfully` in the log, prove nothing about
whether anything painted. Never report a launch as a smoke test.

Note also that `BackgroundColour` in `main.go` (currently `RGB(27, 38, 54)`) is
what a blank window shows. A dark window is **not** evidence that CSS loaded — it
is the Wails window colour with nothing on top of it.

## The technique

Edge is the same Chromium engine WebView2 runs, and it can render headlessly and
print the resulting DOM.

```bash
cd frontend && bun x vite build            # build the real artifact
# serve dist on a port with SPA fallback (any static server)
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --no-sandbox \
  --virtual-time-budget=10000 \
  --user-data-dir=<temp-dir> \
  --dump-dom http://127.0.0.1:<port>/ > dom.html
```

If `<div id="root">` in `dom.html` is empty, that is the blank window, reproduced
in a terminal. Console and network errors arrive on stderr.

`frontend/scripts/render-smoke.mjs` automates exactly this and runs in ~4s. Use
it first:

```bash
bun --cwd="frontend" run render:smoke
```

## Dead ends — each verified, do not retry

| Approach | Why it fails |
|---|---|
| `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222` | Wails overrides it. No CDP port ever opens. |
| `windows.Options{AdditionalBrowserArgs: ...}` | **Does not exist in Wails v2.12.0** — it is a v3 field. Confirmed against the module cache. |
| jsdom against `dist/` | jsdom 29 removed `ResourceLoader`, cannot execute `<script type="module">`, and lacks `ResizeObserver`/`getAnimations`. It throws for reasons a real browser never would. |
| `wails build -devtools` | Works, but needs a human to right-click → Inspect. Not automatable. |
| `wails dev` log | Frontend console errors do **not** reach stdout. The `WebView2Process failed with kind 1/4/6` lines are the *teardown* sequence when the process is killed — check the timestamp before treating them as a crash. |

## Reading a failure

**`#root` is empty.** A module-level throw, or a render throw with no error
boundary above the routes.

Note: `App.tsx` imports every route eagerly. A module-level throw in **any**
route blanks the **whole** app, not just that route — verified by breaking
`DownloadsRoute.tsx` and watching `/` go blank too. So a blank window does not
tell you which route is at fault.

**`#root` has content but a marker is missing.** The shell mounted and one route
did not render its own content. Check `ROUTE_MARKERS` in the script.

## Routing gotcha

`src/main.tsx` uses **`HashRouter`**, so routes live after the `#`
(`/#/downloads`, not `/downloads`). Requesting `/downloads` serves `index.html`
with an empty hash and renders the *default* route — a check that looks like it
covers Downloads while never leaving Today.

## What the gate does and does not cover

`frontend-render-smoke` in `lefthook.yml` (frontend-heavy lane) runs on every
commit touching `frontend/**` or `lefthook.yml`.

- [x] The production bundle mounts React
- [x] The app shell and its navigation render
- [x] `/#/downloads` renders its own content
- [ ] **Not covered:** any route without an entry in `ROUTE_MARKERS`
- [ ] **Not covered:** anything requiring `window.go` — the Wails bindings do not
      exist in headless Edge, so panels that need live backend data degrade to
      their empty/error states. That is by design; the check is "does it paint",
      not "does it have data".
- [ ] **Not covered:** WebView2-runtime-specific failures (e.g. security software
      injecting unsigned DLLs, which Wails exposes
      `WebviewDisableRendererCodeIntegrity` for). Edge and WebView2 share an
      engine, not an environment.

**Adding a route to this repo does not add it to this gate.** Add it to
`ROUTE_MARKERS` deliberately.

## When you change the gate

Break the app on purpose and watch it go red before trusting it:

```bash
printf '\nthrow new Error("deliberate break");\n' >> frontend/src/App.tsx
bun --cwd="frontend" run render:smoke   # must fail with "#root is empty"
git checkout -- frontend/src/App.tsx
```

A gate nobody has seen fail is not a gate.
