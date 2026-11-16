// ADR-032 §5 async-state gates over the identified-violation baseline.
//
//   node ./scripts/check-async-state-gates.mjs         staged files (pre-commit)
//   node ./scripts/check-async-state-gates.mjs --all   whole tree (pre-merge-commit)
//
// A violation the baseline does not name fails. A baseline entry whose file was checked and no longer
// has that violation is stale and fails, naming the entry to delete. Staging the baseline or the gate
// code itself checks the whole tree, because either can make any entry stale. The entry count is
// printed on every run; it is reported, never gated.

import { execFileSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';

import {
  BASELINE_FILE,
  asyncStateRuleSettings,
  compareWithBaseline,
  createAsyncStatePlugin,
  formatStaleEntry,
  formatViolation,
  loadAsyncStateBaseline,
  summarizeBaseline,
} from './async-state-gates.helpers.mjs';

/** Source files the gates read. */
const SOURCE_FILE = /^src\/.+\.(ts|tsx)$/u;

/** Staged files that can change any entry's verdict, so they widen the check to the whole tree. */
const GATE_FILES = new Set([BASELINE_FILE, 'eslint.config.js', 'scripts/async-state-gates.helpers.mjs', 'scripts/check-async-state-gates.mjs']);

/**
 * Lists staged paths relative to the frontend root, deletions included.
 * @param {string} root Frontend root.
 * @returns {string[]} Staged paths with posix separators.
 */
function readStagedFiles(root) {
  /** NUL-separated `git diff --cached` output, limited to the frontend directory. */
  const output = execFileSync('git', ['diff', '--cached', '--name-only', '-z', '--diff-filter=ACMRD', '--relative'], { cwd: root, encoding: 'utf8' });
  return output.split('\0').filter(Boolean);
}

/**
 * Lints files with only the async-state rules and collects every identified violation.
 * @param {string} root Frontend root.
 * @param {string[]} patterns Files or globs relative to the root.
 * @returns {Promise<{found: Array<object>, checked: Set<string>, fatal: string[], unparsed: Set<string>}>} Violations, files linted, parse failures and the files that did not parse.
 */
async function collectViolations(root, patterns) {
  /** Every violation the rules report, baselined or not. */
  const found = [];
  /** ESLint limited to the async-state rules, independent of the editor config. */
  const eslint = new ESLint({
    cwd: root,
    overrideConfigFile: true,
    errorOnUnmatchedPattern: false,
    overrideConfig: [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
        plugins: { 'async-state': createAsyncStatePlugin({ root, onViolation: (violation) => found.push(violation) }) },
        rules: asyncStateRuleSettings(),
      },
    ],
  });
  /** One result per linted file. */
  const results = patterns.length === 0 ? [] : await eslint.lintFiles(patterns);
  /** Files ESLint actually read. */
  const checked = new Set(results.map((result) => path.relative(root, result.filePath).split(path.sep).join('/')));
  /** Results the rules could not judge because their file did not parse. */
  const unparsedResults = results.filter((result) => result.messages.some((message) => message.fatal));
  /** Parse errors, one line each. */
  const fatal = unparsedResults.flatMap((result) => result.messages.filter((message) => message.fatal).map((message) => `${result.filePath}: ${message.message}`));
  /** Files that did not parse, so their baseline entries cannot be judged stale. */
  const unparsed = new Set(unparsedResults.map((result) => path.relative(root, result.filePath).split(path.sep).join('/')));
  return { found, checked, fatal, unparsed };
}

/**
 * Runs the gates and returns the exit status.
 * @param {object} [options] Run options.
 * @param {string} [options.root] Frontend root.
 * @param {boolean} [options.all] Check the whole tree instead of the staged files.
 * @param {string[]} [options.staged] Staged paths; read from git when omitted.
 * @param {(line: string) => void} [options.log] Output sink.
 * @returns {Promise<number>} 0 when nothing is new or stale, otherwise 1.
 */
export async function runAsyncStateGates({ root = process.cwd(), all = false, staged, log = console.log } = {}) {
  /** Committed baseline. */
  const baseline = loadAsyncStateBaseline(root);
  /** Staged paths, only needed outside whole-tree mode. */
  const stagedFiles = all ? [] : (staged ?? readStagedFiles(root));
  /** Whole tree when asked, or when the baseline or the gate code is staged. */
  const wholeTree = all || stagedFiles.some((file) => GATE_FILES.has(file));
  /** Staged sources, deleted ones included so their entries can turn stale. */
  const stagedSources = stagedFiles.filter((file) => SOURCE_FILE.test(file));
  /** Files or globs handed to ESLint. */
  const patterns = wholeTree ? ['src/**/*.{ts,tsx}'] : stagedSources.filter((file) => existsSync(path.join(root, file)));
  const { found, checked, fatal, unparsed } = await collectViolations(root, patterns);
  /** Staged sources whose baseline entries are judged. */
  const scope = new Set(stagedSources);
  const { added, stale } = compareWithBaseline({ found, baseline, inScope: (file) => !unparsed.has(file) && (wholeTree || scope.has(file)) });
  log(`async-state gates: baseline ${summarizeBaseline(baseline)}; checked ${wholeTree ? 'the whole tree' : `${checked.size} staged file(s)`}.`);
  for (const line of [...fatal.map((message) => `cannot check, parse error: ${message}`), ...added.map(formatViolation), ...stale.map(formatStaleEntry)]) {
    log(line);
  }
  return fatal.length + added.length + stale.length === 0 ? 0 : 1;
}

/**
 * Whether the script path Node was started with is this module. Both sides are resolved through
 * symlinks and junctions, and compared without letter case on Windows, so a hook started through a
 * different spelling of the path still runs the gate instead of exiting 0 without checking.
 * @param {string | undefined} argvPath The script path Node was started with (`process.argv[1]`).
 * @param {string} moduleUrl This module's `import.meta.url`.
 * @param {string} [platform] The operating system, `process.platform` by default.
 * @returns {boolean} True when Node was started with this module.
 */
export function isCliEntry(argvPath, moduleUrl, platform = process.platform) {
  if (!argvPath) return false;
  /** @param {string} file A path to normalise. @returns {string} The comparable path. */
  const comparable = (file) => {
    /** The path with symlinks and junctions resolved when it exists. */
    const resolved = existsSync(file) ? realpathSync(file) : path.resolve(file);
    return platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  return comparable(argvPath) === comparable(fileURLToPath(moduleUrl));
}

if (isCliEntry(process.argv[1], import.meta.url)) {
  try {
    process.exitCode = await runAsyncStateGates({ all: process.argv.includes('--all') });
  } catch (error) {
    console.error('async-state gates:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
