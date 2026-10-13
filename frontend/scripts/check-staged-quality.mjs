import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Proves the locked local ESLint install is resolvable before dharness can skip anything.
 * @param {string} frontendDir Frontend workspace.
 * @returns {void} Nothing; throws when the entry or a platform shim is absent.
 */
function requireLocalEslint(frontendDir) {
  /** Local CLI entry point installed by the locked ESLint dependency. */
  const cli = path.join(frontendDir, 'node_modules', 'eslint', 'bin', 'eslint.js');
  /** dharness resolves the local bin shim, not merely the package's entry file. */
  const shim = path.join(frontendDir, 'node_modules', '.bin', 'eslint');
  /** Bun on Windows installs .exe shims; other installers may use .cmd. */
  const shims = process.platform === 'win32' ? [shim + '.exe', shim + '.cmd', shim] : [shim];
  if (!existsSync(cli) || !shims.some((candidate) => existsSync(candidate))) {
    throw new Error('Local ESLint is missing; install frontend dependencies before checking.');
  }
}

/**
 * Launches the native staged check and maps its completion to an exit status.
 * @param {string} frontendDir Frontend workspace used as the child-process cwd.
 * @param {typeof spawnSync} run Process launcher, injectable for exit-status tests.
 * @returns {number} Exact dharness status, or failure for an incomplete process.
 */
function launchStagedCheck(frontendDir, run) {
  /** Completed process or launch failure; no shell interpolation is used. */
  const result = run(process.platform === 'win32' ? 'dharness.exe' : 'dharness', ['check'], {
    cwd: frontendDir,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

/**
 * Requires local ESLint and a loadable repository config before dharness can skip anything.
 * @param {string} frontendDir Frontend workspace.
 * @param {typeof spawnSync} run Process launcher, injectable for exit-status tests.
 * @param {typeof loadFrontendConfig} loadConfig Config boundary, injectable without transforming ESLint inside Vitest.
 * @returns {Promise<number>} Exact dharness status, or failure for an incomplete process.
 */
export async function runStagedQuality(frontendDir = process.cwd(), run = spawnSync, loadConfig = loadFrontendConfig) {
  requireLocalEslint(frontendDir);
  /** Config for a real source entry, so config-only edits cannot hide behind an empty staged set. */
  const config = await loadConfig(frontendDir);
  if (!config) {
    throw new Error('The frontend entry is ignored by ESLint; staged quality cannot be validated.');
  }
  return launchStagedCheck(frontendDir, run);
}

/**
 * Loads the real local flat config at the runtime boundary, outside Vitest transforms.
 * @param {string} frontendDir Frontend workspace.
 * @returns {Promise<object|undefined>} Config selected for the application entry.
 */
async function loadFrontendConfig(frontendDir) {
  /** Repository-installed API, resolved next to this script like its CLI. */
  const { ESLint } = await import('eslint');
  return new ESLint({ cwd: frontendDir }).calculateConfigForFile('src/main.tsx');
}

/** Whether this module is the CLI rather than an imported test subject. */
const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  try {
    process.exitCode = await runStagedQuality();
  } catch (error) {
    console.error('staged-quality:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
