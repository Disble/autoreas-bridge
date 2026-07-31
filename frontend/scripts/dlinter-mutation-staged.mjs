import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';

/* eslint-disable sonarjs/no-os-command-from-path -- Git must be resolved from the developer environment that launched this hook so it can inspect the active worktree. The repository cannot control this lookup, and arguments are passed directly rather than through a shell. */
const cwd = process.cwd();
const strykerEntrypoint = path.resolve(cwd, 'node_modules', '@stryker-mutator', 'core', 'bin', 'stryker.js');
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd, encoding: 'utf8' }).trim();
const surface = path.relative(root, cwd).replaceAll('\\', '/');
const prefix = surface === '' ? '' : `${surface}/`;
const output = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { cwd, encoding: 'utf8' });
const staged = output.split(/\r?\n/).filter((file) => file.startsWith(`${prefix}src/`) && /\.(ts|tsx)$/.test(file) && !/\.(test|spec)\.[cm]?[jt]sx?$/.test(file));

if (staged.length === 0) {
  console.log('dlinter mutation guard: no staged production TypeScript lines.');
  process.exit(0);
}

for (const file of staged) {
  if (spawnSync('git', ['diff', '--quiet', '--', file], { cwd }).status !== 0) {
    throw new Error(`dlinter mutation guard: partial staging is unsupported for ${file}; stage or revert its remaining changes.`);
  }
}

const diff = execFileSync('git', ['diff', '--cached', '--unified=0', '--diff-filter=ACMR', '--', ...staged], { cwd, encoding: 'utf8' });
const ranges = [];
let file = '';

for (const line of diff.split(/\r?\n/)) {
  if (line.startsWith('+++ b/')) file = line.slice(6);
  const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
  if (match && file.startsWith(prefix)) {
    const count = Number(match[2] ?? '1');
    if (count > 0) ranges.push(`${file.slice(prefix.length)}:${match[1]}-${Number(match[1]) + count - 1}`);
  }
}

if (ranges.length === 0) {
  console.log('dlinter mutation guard: no added production TypeScript lines.');
  process.exit(0);
}

const cacheDir = path.resolve(root, gitDir, 'dlinter');
const cacheFile = path.join(cacheDir, 'stryker-staged.json');
try {
  if (existsSync(cacheFile)) JSON.parse(readFileSync(cacheFile, 'utf8'));
} catch {
  rmSync(cacheFile, { force: true });
}
mkdirSync(cacheDir, { recursive: true });
rmSync(path.join(cwd, '.dlinter-mutation-tmp'), { recursive: true, force: true });
const result = spawnSync(process.execPath, [strykerEntrypoint, 'run', 'stryker.dlinter.json', '--incremental', '--incrementalFile', cacheFile, '--mutate', ranges.join(','), '--cleanTempDir', 'always'], { cwd, stdio: 'inherit' });
process.exit(result.status ?? 1);
