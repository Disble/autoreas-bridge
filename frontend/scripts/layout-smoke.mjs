// Renders the real notification components in headless Edge and fails when the
// browser says their boxes are wrong.
//
// This exists because a layout bug ships through a completely green suite.
// jsdom has no layout engine, so vitest can assert that an element carries
// `line-clamp-2` and never learn whether anything wrapped; `render-smoke.mjs`
// dumps DOM without measuring it. Two notification-toast defects shipped that
// way in one afternoon: a title that pushed the toast past the window edge, and
// action buttons that took half the card and squeezed the content into a ribbon.
//
// The fixtures IMPORT the components rather than reproducing their markup. A
// fixture that duplicated their classes would keep passing after the component
// changed, and a guard that silently stops guarding is worse than no guard.
//
// The measuring happens in the page (`scripts/layout-fixtures/main.tsx`), which
// writes its verdict into `data-layout-verdict`. This script only builds,
// serves, renders, and reads that attribute back -- which is what keeps it
// simple enough to be worth trusting.

import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync, readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { clearTimeout, setTimeout } from 'node:timers';
import { URL } from 'node:url';

/** Built fixture bundle this smoke test serves. */
const DIST = path.resolve(import.meta.dirname, '..', 'dist-layout');
/**
 * The fixture page inside that bundle.
 *
 * Nested, because the build keeps the root at the frontend project so Tailwind
 * detects `src/**` as a source -- and Vite mirrors the entry's path under the
 * out dir. Rooting the build at the fixture folder instead flattened this path
 * and cost every utility the components under test rely on.
 */
const ENTRY = path.join(DIST, 'scripts', 'layout-fixtures', 'index.html');
/** Hard ceiling for one headless render before the run is called a failure. */
const RENDER_TIMEOUT_MS = 60000;
/** Edge virtual-time budget, so the page settles without waiting in real time. */
const VIRTUAL_TIME_BUDGET_MS = 10000;
/** Viewport the fixtures are measured at; a toast is pinned to the top-right of it. */
const VIEWPORT = '1280,900';

/** Whatever the browser printed on stderr during the last render, for failure reports. */
let browserLog = '';

/** Extension-to-MIME map for the throwaway static server. */
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};

/**
 * Locates an Edge binary, preferring EDGE_PATH over the standard install paths.
 * @returns {string|undefined} Path to msedge.exe, or undefined when none exists.
 */
function findEdge() {
  const candidates = [
    process.env.EDGE_PATH,
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.PROGRAMFILES}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.LOCALAPPDATA}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

/**
 * Builds the fixture bundle. Exits on failure, because measuring a stale build
 * would report on components that are no longer there.
 * @returns {void}
 */
function buildFixtures() {
  const result = spawnSync('bun', ['x', 'vite', 'build', '--config', 'vite.layout.config.ts'], {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: 'pipe',
    shell: true,
  });
  if (result.status !== 0) {
    console.error('layout-smoke: the fixture build failed');
    console.error(result.stderr?.toString() ?? '');
    process.exit(1);
  }
}

/**
 * Serves the fixture bundle.
 * @returns {Promise<{server: import('node:http').Server, port: number}>} The server and its port.
 */
function startServer() {
  const server = createServer((request, response) => {
    const requested = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    let file = path.join(DIST, requested);
    if (!existsSync(file) || requested === '/') {
      file = ENTRY;
    }
    response.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
    response.end(readFileSync(file));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

/**
 * Renders the fixture page at a fixed viewport and resolves with its DOM.
 * @param {string} edge Path to the Edge binary.
 * @param {string} profileDir Throwaway user-data dir, so runs never share state.
 * @param {string} url Absolute URL to load.
 * @returns {Promise<string>} The dumped DOM.
 */
function renderFixtures(edge, profileDir, url) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      edge,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-sandbox',
        '--no-first-run',
        '--disable-extensions',
        // The page's own console, forwarded to stderr. When a fixture fails to
        // mount, this is the only thing that says why.
        '--enable-logging=stderr',
        // Pinned rather than left to the default: every assertion here is about
        // a box, so a viewport that varied between machines would make the
        // whole gate advisory.
        `--window-size=${VIEWPORT}`,
        `--virtual-time-budget=${VIRTUAL_TIME_BUDGET_MS}`,
        `--user-data-dir=${profileDir}`,
        '--dump-dom',
        url,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let dom = '';
    child.stdout.on('data', (chunk) => {
      dom += chunk.toString();
    });
    // Kept rather than discarded: when the page fails to mount, the browser's
    // own console is the only thing that says why, and a gate that reports "it
    // rendered nothing" without saying why is a dead end.
    child.stderr.on('data', (chunk) => {
      browserLog += chunk.toString();
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`headless render timed out after ${RENDER_TIMEOUT_MS}ms`));
    }, RENDER_TIMEOUT_MS);
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', () => {
      clearTimeout(timer);
      resolve(dom);
    });
  });
}

/**
 * Reads the verdict the fixture page wrote into the DOM.
 *
 * `pending` is treated as a failure rather than a pass: it means the page never
 * measured, which is exactly the state a broken fixture leaves behind, and a
 * gate that reads "not yet" as "fine" stops guarding on its first bad day.
 *
 * @param {string} dom Serialized DOM for the fixture page.
 * @returns {{verdict: string, report: string}} The verdict and the per-check lines behind it.
 */
export function readVerdict(dom) {
  const match = /data-layout-verdict="([^"]*)">([\s\S]*?)<\/pre>/.exec(dom);
  if (!match) {
    return { verdict: 'missing', report: 'the fixture page rendered no verdict at all' };
  }
  return { verdict: match[1], report: decodeEntities(match[2]).trim() };
}

/**
 * Undoes the entity escaping `--dump-dom` applies to text content, so the
 * report reads the way the fixture wrote it.
 * @param {string} text Serialized text content.
 * @returns {string} The same text with its entities resolved.
 */
function decodeEntities(text) {
  return text
    .replaceAll('&amp;', '&')
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'");
}

// The module is importable for its parser's tests; running it is what performs
// the check, so everything below is skipped when it is merely imported.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const edge = findEdge();
  if (!edge) {
    // Fail rather than skip: a silent skip is how a gate stops guarding without
    // anyone noticing. Set EDGE_PATH if Edge lives somewhere unusual.
    console.error('layout-smoke: could not find msedge.exe. Set EDGE_PATH to your Edge binary.');
    process.exit(1);
  }

  buildFixtures();

  const { server, port } = await startServer();
  const profileDir = mkdtempSync(path.join(tmpdir(), 'layout-smoke-'));

  let result;
  let dom = '';
  try {
    dom = await renderFixtures(edge, profileDir, `http://127.0.0.1:${port}/`);
    result = readVerdict(dom);
    if (result.verdict !== 'pass') {
      // A missing verdict means the page never measured, which is a different
      // failure from a measurement that came out wrong: almost always the
      // fixture failing to mount at all. The DOM is the only thing that says
      // which, and without it this gate reports a dead end.
      result.report += `\n\nWhat the page rendered instead:\n${dom.slice(0, 700)}`;
      const complaints = browserLog.split('\n').filter((line) => /ERROR|Uncaught|SyntaxError|TypeError/.test(line));
      if (complaints.length > 0) {
        result.report += `\n\nWhat the browser said:\n${complaints.slice(0, 8).join('\n')}`;
      }
    }
  } finally {
    server.close();
    rmSync(profileDir, { recursive: true, force: true });
  }

  if (result.verdict !== 'pass') {
    console.error(`layout-smoke: the notification toast does not lay out correctly (${result.verdict}).\n`);
    console.error(result.report);
    console.error('\nReproduce it yourself:');
    console.error('  cd frontend && bunx vite build --config vite.layout.config.ts');
    console.error('  npx serve dist-layout');
    console.error(`  "${edge}" --headless=new --window-size=${VIEWPORT} --dump-dom http://127.0.0.1:<port>/`);
    process.exit(1);
  }

  console.log(`layout-smoke: the notification toast lays out correctly at ${VIEWPORT.replace(',', 'x')}.`);
  console.log(result.report);
}
