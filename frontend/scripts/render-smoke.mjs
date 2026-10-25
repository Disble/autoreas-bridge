// Renders the production bundle in headless Edge and fails if the app paints
// nothing.
//
// This exists because a blank window ships silently. Every other frontend check
// runs source through Vite in jsdom: `tsc` proves types, vitest proves component
// behaviour with the panels mocked, and none of them ever execute the minified
// artifact that actually gets embedded into the binary. Release 1.2.0 passed the
// entire gate, built, installed, and opened to an empty window.
//
// Edge is the same Chromium engine WebView2 runs, so `--dump-dom` against the
// real `dist/` output is the closest thing to opening the app that a terminal
// can do.
//
// Deliberately NOT used here, each verified as a dead end:
//   - WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port : Wails
//     overrides it, no CDP port ever opens.
//   - windows.Options{AdditionalBrowserArgs} : does not exist in Wails v2.12.0,
//     it is a v3 field.
//   - jsdom against dist : jsdom 29 removed ResourceLoader, cannot execute
//     <script type="module">, and lacks ResizeObserver/getAnimations, so it
//     throws for reasons a real browser never would.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
// Imported explicitly rather than taken from globals: this file is linted with
// the frontend's browser config, which does not declare Node's globals.
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';

import { resolveServedFile } from './static-serve.helpers.mjs';

// Resolves the binary from PATH on purpose: `bun` must resolve from the developer environment that launched this hook, exactly as every other frontend job in lefthook.yml resolves it. The repository cannot control that lookup, and arguments are passed as an array rather than through a shell.

/** Built bundle the smoke server serves; the real production output, not a dev build. */
const DIST = path.resolve(import.meta.dirname, '..', 'dist');
/** Hard ceiling for one headless render before the run is called a failure. */
const RENDER_TIMEOUT_MS = 60000;
/** Edge virtual-time budget, so the page settles without waiting in real time. */
const VIRTUAL_TIME_BUDGET_MS = 10000;

/** The splash index.html paints before the app loads; its presence after the render means no mount. */
const SPLASH_MARKER = 'id="airis-splash"';

/** Markers that only exist once React has mounted the shell and its navigation. */
const REQUIRED_MARKERS = ['Today', 'Catalog', 'Downloads'];

/** Edge attempts per route; only a timeout earns the second one (see renderRouteWithRetry). */
const RENDER_ATTEMPTS = 2;

/**
 * Route-specific markers, proving the route actually rendered its own content.
 * Every route the rail navigates to is listed, and the keys are the routes this
 * run visits. Each marker is static header or empty-state copy, never data: no
 * Wails runtime backs this static-served bundle, so every binding degrades.
 */
const ROUTE_MARKERS = {
  // The day tabs are static schedule chrome, present before the degraded schedule read settles.
  '/': ['Thursday'],
  // The degraded `GetAnimes` read resolves to no anime, so the Catalog hides its
  // toolbar and settles on its actually-empty state.
  '/#/catalog': ['Your catalog is empty'],
  // No open season resolves headless, so the create-season card is the deterministic marker.
  '/#/season': ['Create a season to start the selection workflow.'],
  '/#/devices': ['Trigger Reconcile'],
  // The default Settings tab is Library, so its field proves the tab body rendered.
  '/#/settings': ['Set where your anime library lives on this computer.', 'Library root'],
  '/#/downloads': ['Configuration', 'Manual check'],
  // No Wails runtime backs this static-served bundle, so every notification
  // center binding degrades and the panel settles on the "unavailable"
  // empty state -- a deterministic marker, not one that depends on live data.
  '/#/notifications': ['Notifications unavailable'],
  // Both Activity markers are static shell copy rather than data: the Activity
  // bindings degrade here exactly like the notification ones, and a marker that
  // waited on a degraded read would only prove the timeout fired.
  '/#/activity': ['Pin this moment', 'Traffic'],
  // The static Create deep link every Airis empty state points at. It must
  // resolve BEFORE `/editor/:id`, so the marker is the Create workspace's own
  // heading: if the identifier route ever wins again, the Library workspace
  // renders here instead and this marker disappears.
  '/#/editor/create': ['Anime 1'],
  // The sort control is static toolbar chrome, independent of the degraded history read.
  '/#/history': ['Newest first'],
};

/** Extension-to-MIME map for the throwaway static server. */
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/**
 * Locates an Edge binary, preferring EDGE_PATH over the standard install paths.
 * @returns {string|undefined} Path to msedge.exe, or undefined when none exists.
 */
function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    String.raw`${process.env['PROGRAMFILES(X86)']}\Microsoft\Edge\Application\msedge.exe`,
    String.raw`${process.env.PROGRAMFILES}\Microsoft\Edge\Application\msedge.exe`,
    String.raw`${process.env.LOCALAPPDATA}\Microsoft\Edge\Application\msedge.exe`,
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

/**
 * Builds the production bundle the smoke test will serve. Exits the process on
 * failure, because rendering a stale dist would prove nothing.
 * @returns {void}
 */
function buildDist() {
  // `vite build` only -- typechecking is frontend-typecheck's job, and paying for
  // it twice would make this gate cost more than the bug it catches.
  const result = spawnSync('bun', ['x', 'vite', 'build'], { // NOSONAR javascript:S4036 -- resolved from PATH on purpose, so it comes from the developer environment that launched this hook, exactly as every other frontend job in lefthook.yml resolves it. The repository cannot control that lookup, and the arguments are passed as an array rather than through a shell. Pinning an absolute path would break across platforms and, on Windows, would have to guess between the .exe, .cmd and .bat shims these tools ship as.
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: 'pipe',
    shell: true,
  });
  if (result.status !== 0) {
    console.error('render-smoke: vite build failed');
    console.error(result.stderr?.toString() ?? '');
    process.exit(1);
  }
}

/**
 * Serves dist with a SPA fallback, mirroring how the Wails asset server answers
 * a client-side route. A gate that only ever requested "/" would miss a bundle
 * that renders at the root and 404s everywhere else.
 */
function startServer() {
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolveServedFile({ dist: DIST, requested, fallback: path.join(DIST, 'index.html') });
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Renders one URL in headless Edge and resolves with the serialized DOM and the
 * browser log. `--enable-logging=stderr` makes Edge print every console message,
 * including `Uncaught` errors and rejections, without a CDP port.
 * @param {string} edge Path to the Edge binary.
 * @param {string} profileDir Throwaway user-data dir, so runs never share state.
 * @param {string} url Absolute URL to load.
 * @returns {Promise<{dom: string, log: string}>} The dumped DOM and stderr log.
 */
function renderRoute(edge, profileDir, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      edge,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--disable-extensions',
        '--enable-logging=stderr',
        '--v=0',
        `--virtual-time-budget=${VIRTUAL_TIME_BUDGET_MS}`,
        `--user-data-dir=${profileDir}`,
        '--dump-dom',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let dom = '';
    let log = '';
    child.stdout.on('data', (chunk) => {
      dom += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      log += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new RenderTimeoutError(`headless render timed out after ${RENDER_TIMEOUT_MS}ms`));
    }, RENDER_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve({ dom, log });
    });
  });
}

/** A render that never finished, as opposed to one that finished blank. */
class RenderTimeoutError extends Error {}

/**
 * Renders a route, retrying once only when Edge times out. A loaded machine can
 * stall the browser launch itself (seen while the full pre-commit gate ran),
 * but a blank bundle never times out: it returns at once with an empty #root,
 * which checkDom fails. So the retry cannot hide the defect this gate exists for.
 * @param {string} edge Path to the Edge binary.
 * @param {string} profileDir Throwaway user-data dir.
 * @param {string} url Absolute URL to load.
 * @returns {Promise<{dom: string, log: string}>} The dumped DOM and stderr log.
 */
async function renderRouteWithRetry(edge, profileDir, url) {
  for (let attempt = 1; attempt < RENDER_ATTEMPTS; attempt += 1) {
    try {
      return await renderRoute(edge, profileDir, url);
    } catch (error) {
      if (!(error instanceof RenderTimeoutError)) {
        throw error;
      }
      console.warn(`render-smoke: ${url} timed out on attempt ${attempt}; retrying once.`);
    }
  }
  return renderRoute(edge, profileDir, url);
}

/**
 * Reports every uncaught error or rejection the page logged. These leave the
 * page painted -- an effect or a promise that throws does not unmount React --
 * so the DOM markers alone would pass a route that is broken at runtime.
 * Extension pages Edge runs on its own are not the app and are ignored.
 * @param {string} log Edge stderr for the route.
 * @param {string} route Route label used in failure messages.
 * @returns {string[]} Human-readable failures; empty means nothing threw.
 */
function uncaughtErrorFailures(log, route) {
  return log
    .split(/\r?\n/)
    .filter((line) => line.includes(':CONSOLE') && line.includes('"Uncaught') && !line.includes('chrome-extension://'))
    .map((line) => `${route}: ${line.slice(line.indexOf('"Uncaught'))}`);
}

/**
 * Asserts a rendered DOM is not an empty shell.
 * @param {string} dom Serialized DOM for the route.
 * @param {string} route Route label used in failure messages.
 * @returns {string[]} Human-readable failures; empty means the route painted.
 */
function checkDom(dom, route) {
  const root = /<div id="root">([\s\S]*)<\/div>\s*<\/body>/.exec(dom);
  const rendered = root ? root[1].trim() : '';

  // index.html ships the splash inside #root, so a bundle that never mounts is not empty: it
  // still shows Airis running. React's first render replaces the splash.
  if (dom.includes(SPLASH_MARKER)) {
    return [`${route}: the splash is still showing — React never mounted`];
  }
  if (rendered.length === 0) {
    return [`${route}: #root is empty — the app painted nothing`];
  }
  return missingMarkerFailures(dom, route, rendered.length);
}

/**
 * Reports the markers a painted route should carry but does not. Split out of
 * `checkDom` so neither function breaches the complexity gate: this script has
 * no tests of its own — it is the smoke test — so its CRAP score is computed at
 * zero coverage and a cyclomatic complexity above four fails outright.
 * @param {string} dom Serialized DOM for the route.
 * @param {string} route Route label used in failure messages.
 * @param {number} renderedLength Characters painted inside `#root`.
 * @returns {string[]} Human-readable failures; empty means every marker is present.
 */
function missingMarkerFailures(dom, route, renderedLength) {
  const failures = [];
  for (const marker of [...REQUIRED_MARKERS, ...(ROUTE_MARKERS[route] ?? [])]) {
    if (!dom.includes(marker)) {
      failures.push(`${route}: rendered ${renderedLength} chars but "${marker}" is missing`);
    }
  }
  return failures;
}

/** Resolved Edge binary for this run. */
const edge = findEdge();
if (!edge) {
  // Fail rather than skip: a silent skip is how a gate stops guarding without
  // anyone noticing. Set EDGE_PATH if Edge lives somewhere unusual.
  console.error('render-smoke: could not find msedge.exe. Set EDGE_PATH to your Edge binary.');
  process.exit(1);
}

buildDist();

/** The throwaway static server and the ephemeral port it bound to. */
const { server, port } = await startServer();
/** Throwaway Edge profile directory for this run. */
const profileDir = mkdtempSync(path.join(tmpdir(), 'render-smoke-'));
/** Collected failures across every route checked. */
const failures = [];

try {
  // The app uses HashRouter (see src/main.tsx), so a route lives after the "#".
  // Requesting "/downloads" would silently serve index.html with an empty hash
  // and render the default route instead -- a check that looks like it covers
  // Downloads while never leaving Today.
  for (const route of Object.keys(ROUTE_MARKERS)) {
    const { dom, log } = await renderRouteWithRetry(edge, profileDir, `http://127.0.0.1:${port}${route}`);
    failures.push(...checkDom(dom, route), ...uncaughtErrorFailures(log, route));
  }
} finally {
  server.close();
  rmSync(profileDir, { recursive: true, force: true });
}

if (failures.length > 0) {
  console.error('render-smoke: the production bundle does not render.\n');
  for (const failure of failures) {
    console.error(`  - ${failure}`);
  }
  console.error('\nReproduce it yourself:');
  console.error('  cd frontend && bun x vite build');
  console.error('  npx serve dist   # or any static server with SPA fallback');
  console.error(`  "${edge}" --headless=new --dump-dom http://127.0.0.1:<port>/`);
  process.exit(1);
}

console.log(`render-smoke: the production bundle renders (${REQUIRED_MARKERS.join(', ')} present on every checked route).`);
