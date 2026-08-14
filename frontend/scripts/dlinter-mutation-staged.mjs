import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

// Resolves the binary from PATH on purpose: Git must be resolved from the developer environment that launched this hook so it can inspect the active worktree. The repository cannot control this lookup, and arguments are passed directly rather than through a shell.

/** Directory the hook was launched from; every Git call is scoped to it. */
const cwd = process.cwd();
/** Stryker's CLI entrypoint, resolved locally so the hook never reaches the network. */
const strykerEntrypoint = path.resolve(cwd, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');
/** Absolute path of the repository root. */
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
/** Path to the Git directory, where the incremental cache is kept. */
const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd, encoding: 'utf8' }).trim();
/** This workspace's path relative to the repo root, e.g. `frontend`. */
const surface = path.relative(root, cwd).replaceAll('\\', '/');
/** `surface` as a path prefix, so repo-relative paths can be matched and stripped. */
const prefix = surface === '' ? '' : `${surface}/`;
/**
 * Whether a repo-relative path is a production TypeScript file in this
 * workspace. Tests are excluded because mutating a test proves nothing.
 * @param {string} file A repo-relative path.
 * @returns {boolean} True when the file is in scope for mutation.
 */
const isProduction = (file) => file.startsWith(`${prefix}src/`) && /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file);
/** Raw `status<TAB>path[<TAB>destination]` lines describing the staged changes. */
const output = execFileSync('git', ['diff', '--cached', '--name-status', '--diff-filter=ACMR'], { cwd, encoding: 'utf8' });
/** Staged production TypeScript files, each carrying the path it was renamed from when there is one. */
const staged = output
  .split(/\r?\n/)
  .filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split('\t');
    return { status, path: paths[paths.length - 1], source: paths.length > 1 ? paths[0] : undefined };
  })
  .filter((entry) => isProduction(entry.path));

if (staged.length === 0) {
  console.log('dlinter mutation guard: no staged production TypeScript lines.');
  process.exit(0);
}

for (const entry of staged) {
  if (spawnSync('git', ['diff', '--quiet', '--', entry.path], { cwd: root }).status !== 0) {
    throw new Error(`dlinter mutation guard: partial staging is unsupported for ${entry.path}; stage or revert its remaining changes.`);
  }
}

// Both halves of a rename must be in the pathspec, and git must run from the
// repo root so every path stays repo-relative.
//
// Rename detection pairs a deleted path with an added one. `--name-status`
// reports only the destination, so a pathspec built from destinations alone
// hides the source: git cannot pair them, and a moved file reads as brand new.
// The guard then mutates the whole file, billing a move as newly authored code.
// Measured 2026-08-13 on the ordering extraction: three byte-identical moved
// components (`similarity index 100%`) contributed 72 of 146 surviving mutants,
// half the deficit, all on lines the commit never touched. A gate that charges
// for moving a file penalizes exactly the refactoring the architecture asks for.
//
// Keeping paths repo-relative also retires the prefix arithmetic that broke this
// script before: slicing `frontend/` off and running from inside `frontend/`
// made git look for `frontend/frontend/src/...`, matching nothing, so the guard
// exited 0 on every commit. See docs/postmortems/postmortem-silent-no-ops.md.
/** Staged paths plus the source of every rename, so git can pair them. */
const stagedPathspec = staged.flatMap((entry) => (entry.source === undefined ? [entry.path] : [entry.source, entry.path]));
/** Zero-context diff of the staged files, the source of the mutated line ranges. */
const diff = execFileSync('git', ['diff', '--cached', '--unified=0', '--diff-filter=ACMR', '--', ...stagedPathspec], { cwd: root, encoding: 'utf8' });
/** Accumulated `file:start-end` ranges handed to Stryker's `--mutate`. */
const ranges = [];
/** File the diff parser is currently inside, tracked across hunk headers. */
let file = '';

for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith('+++ b/')) file = line.slice(6);
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (match && isProduction(file)) {
    const count = Number(match[2] ?? '1');
    if (count > 0) ranges.push(`${file.slice(prefix.length)}:${match[1]}-${Number(match[1]) + count - 1}`);
  }
}

/**
 * Staged entries whose content actually changed. A 100% rename moved bytes
 * without touching them, so it legitimately yields no hunks — the one case that
 * makes "staged but no ranges" honest rather than broken.
 */
const contentChanged = staged.filter((entry) => entry.status !== 'R100' && entry.status !== 'C100');

// A file whose content changed but resolved to no range is a contradiction, not
// a quiet pass: it came from a diff, so it must yield at least one hunk.
// Reaching here means the diff or the parse silently stopped matching, which is
// exactly how this guard spent its life exiting 0 without mutating anything.
// Fail loudly instead.
if (ranges.length === 0 && contentChanged.length > 0) {
  console.error(`dlinter mutation guard: ${contentChanged.length} staged production file(s) with changed content resolved to no diff ranges.`);
  console.error('The diff or its parsing is broken — this is a defect in this script, not an empty change.');
  console.error(`Files: ${contentChanged.map((entry) => entry.path).join(', ')}`);
  process.exit(1);
}

if (ranges.length === 0) {
  console.log('dlinter mutation guard: no added production TypeScript lines.');
  process.exit(0);
}

/** Directory holding Stryker's incremental cache, kept inside the Git dir so it is never committed. */
const cacheDir = path.resolve(root, gitDir, 'dlinter');
/** The incremental cache file itself; a corrupt one is discarded rather than fatal. */
const cacheFile = path.join(cacheDir, 'stryker-staged.json');
try {
  if (existsSync(cacheFile)) JSON.parse(readFileSync(cacheFile, 'utf8'));
} catch {
  rmSync(cacheFile, { force: true });
}
mkdirSync(cacheDir, { recursive: true });
rmSync(path.join(cwd, '.dlinter-mutation-tmp'), { recursive: true, force: true });
/** Outcome of the scoped Stryker run; its exit status becomes the hook's. */
const result = spawnSync(process.execPath, [strykerEntrypoint, 'run', 'stryker.dlinter.json', '--incremental', '--incrementalFile', cacheFile, '--mutate', ranges.join(','), '--cleanTempDir', 'always'], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
