import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import tsParser from '@typescript-eslint/parser';
import { ESLint } from 'eslint';
import { afterAll, describe, expect, it } from 'vitest';
import { asyncStateRuleSettings, createAsyncStatePlugin, formatStaleEntry, formatStaleException } from '../async-state-gates.helpers.mjs';
import { isCliEntry, runAsyncStateGates } from '../check-async-state-gates.mjs';

/** The frontend workspace, whose eslint.config.js registers the rules. */
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Violations the collector saw during the current lint. */
const collected = [];

/** ESLint with only the async-state rules, collecting every violation (the check script's view). */
const rulesOnly = new ESLint({
  cwd: frontendRoot,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.{ts,tsx}'],
      languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
      plugins: { 'async-state': createAsyncStatePlugin({ root: frontendRoot, onViolation: (violation) => collected.push(violation) }) },
      rules: asyncStateRuleSettings(),
    },
  ],
});

/**
 * Lints `code` as if it lived at `file` and returns each finding as `rule subject`.
 * @param {string} file Path relative to the frontend root.
 * @param {string} code Source text.
 * @returns {Promise<string[]>} Sorted, de-duplicated findings.
 */
async function findings(file, code) {
  collected.length = 0;
  await rulesOnly.lintText(code, { filePath: path.join(frontendRoot, file) });
  return [...new Set(collected.map((violation) => `${violation.rule} ${violation.specifier ?? violation.symbol}`))].sort();
}

/** Import of an infrastructure adapter from a file two levels under src/<layer>. */
const INFRA_IMPORT = "import { x } from '../../infrastructure/x';";

describe('async-state rules', () => {
  it.each([
    ['feature imports infrastructure', 'src/features/a/b.ts', INFRA_IMPORT, ['no-infrastructure-import ../../infrastructure/x']],
    ['shared store imports infrastructure', 'src/shared/store/b.ts', INFRA_IMPORT, ['no-infrastructure-import ../../infrastructure/x']],
    ['shared/query imports infrastructure', 'src/shared/query/b.ts', INFRA_IMPORT, []],
    ['feature imports the generated bindings', 'src/features/a/b.ts', "import { Get } from '../../../wailsjs/go/desktop/App';", ['no-infrastructure-import ../../../wailsjs/go/desktop/App']],
    ['feature re-exports infrastructure', 'src/features/a/b.ts', "export * from '../../infrastructure/x';", ['no-infrastructure-import ../../infrastructure/x']],
    ['feature loads infrastructure lazily', 'src/features/a/b.ts', "void import('../../infrastructure/x');", ['no-infrastructure-import ../../infrastructure/x']],
    ['feature imports a sibling', 'src/features/a/b.ts', "import { x } from './infrastructure/x';", []],
    ['feature reads window.go', 'src/features/a/b.ts', 'const go = (window as any).go;', ['no-window-go window.go']],
    ['infrastructure reads window.go', 'src/infrastructure/b.ts', 'const go = window.go;', []],
    ['feature imports TanStack Query', 'src/features/a/b.ts', "import { useQuery } from '@tanstack/react-query';", ['react-query-in-shared-query @tanstack/react-query']],
    ['shared/query imports TanStack Query', 'src/shared/query/b.ts', "import { useQuery } from '@tanstack/react-query';", []],
    ['feature creates a vanilla store', 'src/features/a/b.ts', "import { createStore } from 'zustand/vanilla';", ['zustand-vanilla-allow-list zustand/vanilla']],
    ['allow-listed store', 'src/shared/keyboard/keyboard.constants.ts', "import { createStore } from 'zustand/vanilla';", []],
    ['feature uses Wails EventsOn', 'src/features/a/b.ts', "import { EventsOn } from 'runtime';\nEventsOn('x', () => {});", ['no-runtime-subscription EventsOn']],
    ['feature calls a named subscription', 'src/features/a/b.ts', 'source.subscribeRecorder(() => {});\nsource.subscribeStarted?.(() => {});', ['no-runtime-subscription subscribeRecorder', 'no-runtime-subscription subscribeStarted']],
    ['feature subscribes to a source', 'src/features/a/b.ts', 'this.pushSource.subscribe(() => {});', ['no-runtime-subscription pushSource.subscribe']],
    ['shared store subscribes to a Zustand store', 'src/shared/store/b.ts', 'store.subscribe(() => {});', []],
    ['feature defines a subscription without calling it', 'src/features/a/b.ts', 'export const s = { subscribeRecorder(listener: () => void) { return listener; } };', []],
    ['infrastructure subscribes', 'src/infrastructure/b.ts', "EventsOn('x', () => {});", []],
    ['feature test fakes the boundary', 'src/features/a/__tests__/b.test.ts', `${INFRA_IMPORT}\nwindow.go = {};\nsource.subscribeX(() => {});`, []],
  ])('%s', async (_name, file, code, expected) => {
    expect(await findings(file, code)).toEqual(expected);
  });
});

/** A baselined import and an excepted subscription, each one named for `src/features/a/named.ts`. */
const NAMED_ENTRIES = {
  baseline: [{ rule: 'no-infrastructure-import', file: 'src/features/a/named.ts', specifier: '../../infrastructure/x' }],
  exceptions: [{ rule: 'no-runtime-subscription', file: 'src/features/a/named.ts', symbol: 'subscribeArchived', reason: 'Push projection.' }],
};

/** The named import and subscription, plus one import and one subscription neither list names. */
const NAMED_CODE = `import { x } from '../../infrastructure/x';
import { y } from '../../infrastructure/y';
source.subscribeArchived(() => {});
source.subscribeNavigate(() => {});
export const all = [x, y];
`;

describe('async-state plugin silencing', () => {
  /** ESLint over the rules with both lists, as eslint.config.js registers them. */
  const silenced = new ESLint({
    cwd: frontendRoot,
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ['**/*.{ts,tsx}'],
        languageOptions: { parser: tsParser, ecmaVersion: 'latest', sourceType: 'module' },
        plugins: { 'async-state': createAsyncStatePlugin({ root: frontendRoot, ...NAMED_ENTRIES }) },
        rules: asyncStateRuleSettings(),
      },
    ],
  });

  it.each([
    ['the named file', 'src/features/a/named.ts', ['async-state/no-infrastructure-import 2', 'async-state/no-runtime-subscription 4']],
    ['another file', 'src/features/a/other.ts', ['async-state/no-infrastructure-import 1', 'async-state/no-infrastructure-import 2', 'async-state/no-runtime-subscription 3', 'async-state/no-runtime-subscription 4']],
  ])('reports what neither the baseline nor the exception list names in %s', async (_name, file, expected) => {
    const [result] = await silenced.lintText(NAMED_CODE, { filePath: path.join(frontendRoot, file) });
    expect(result.messages.map((message) => `${message.ruleId} ${message.line}`).sort()).toEqual(expected.sort());
  });
});

/** ESLint with the real workspace config: the editor and `dharness check` view. */
const workspace = new ESLint({ cwd: frontendRoot });

/** A file whose `subscribeRecorder` is in the committed exception list. */
const EXCEPTED_FILE = 'src/features/activity/feed/use-activity-live-refresh.ts';

/** The excepted subscription plus one new infrastructure import, a barrel, react-aria-components and another subscription. */
const MIXED_CODE = `import { y } from '../../../infrastructure/brand-new';
import { z } from './z/index';
import { Button } from 'react-aria-components';
source.subscribeRecorder(() => {});
source.subscribeArchived(() => {});
export const all = [y, z, Button];
`;

/**
 * Lints `code` with the workspace config and returns the restriction findings.
 * @param {string} file Path relative to the frontend root.
 * @param {string} code Source text.
 * @returns {Promise<string[]>} `ruleId line` for the import bans and async-state rules.
 */
async function workspaceFindings(file, code) {
  const [result] = await workspace.lintText(code, { filePath: path.join(frontendRoot, file) });
  return result.messages
    .filter((message) => message.ruleId === 'no-restricted-imports' || message.ruleId?.startsWith('async-state/'))
    .map((message) => `${message.ruleId} ${message.line}`);
}

// Pay the cold config load before any test budget starts (see eslint-icon-only-rule.test.mjs).
await workspaceFindings(EXCEPTED_FILE, MIXED_CODE);

describe('workspace ESLint config', () => {
  it.each([
    [
      EXCEPTED_FILE,
      ['async-state/no-infrastructure-import 1', 'no-restricted-imports 2', 'no-restricted-imports 3', 'async-state/no-runtime-subscription 5'],
    ],
    [
      'src/features/activity/feed/clean-file.ts',
      ['async-state/no-infrastructure-import 1', 'no-restricted-imports 2', 'no-restricted-imports 3', 'async-state/no-runtime-subscription 4', 'async-state/no-runtime-subscription 5'],
    ],
  ])('keeps the barrel and react-aria bans and silences only the committed exception in %s', async (file, expected) => {
    expect((await workspaceFindings(file, MIXED_CODE)).sort()).toEqual(expected.sort());
  });
});

/** Scratch frontend roots created by the check-script tests. */
const roots = [];

afterAll(() => {
  for (const root of roots) rmSync(root, { recursive: true, force: true });
});

/** Baseline of the scratch roots: one import in legacy.ts, one subscription in other.ts. */
const SCRATCH_BASELINE = [
  { rule: 'no-infrastructure-import', file: 'src/features/a/legacy.ts', specifier: '../../infrastructure/x' },
  { rule: 'no-runtime-subscription', file: 'src/features/a/other.ts', symbol: 'subscribeRecorder' },
];

/**
 * Creates a scratch frontend root holding the baseline, the exception list when given, and the sources.
 * @param {Record<string, string>} sources Source text by path relative to the root.
 * @param {Array<object>} [exceptions] Exception entries; no exception file when omitted.
 * @returns {string} The root.
 */
function scratchRoot(sources, exceptions) {
  /** Fresh root outside the worktree. */
  const root = mkdtempSync(path.join(os.tmpdir(), 'async-state-gates-'));
  roots.push(root);
  writeFileSync(path.join(root, 'async-state-baseline.json'), JSON.stringify({ version: 1, violations: SCRATCH_BASELINE }));
  if (exceptions !== undefined) {
    writeFileSync(path.join(root, 'async-state-exceptions.json'), JSON.stringify({ version: 1, exceptions }));
  }
  for (const [file, code] of Object.entries(sources)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), code);
  }
  return root;
}

/** Both legacy violations still present. */
const LEGACY = { 'src/features/a/legacy.ts': INFRA_IMPORT, 'src/features/a/other.ts': 'source.subscribeRecorder(() => {});' };

describe('check-async-state-gates', () => {
  it.each([
    ['a staged legacy file keeps its baselined violation', LEGACY, { staged: ['src/features/a/legacy.ts'] }, 0, []],
    ['a staged file adds a violation', { ...LEGACY, 'src/features/a/new.ts': 'const go = window.go;' }, { staged: ['src/features/a/new.ts'] }, 1, ["src/features/a/new.ts:1 [no-window-go] 'window.go'"]],
    ['a staged file drops its baselined violation', { ...LEGACY, 'src/features/a/legacy.ts': 'export {};' }, { staged: ['src/features/a/legacy.ts'] }, 1, [formatStaleEntry(SCRATCH_BASELINE[0])]],
    ['a staged deletion leaves its entry behind', { 'src/features/a/other.ts': LEGACY['src/features/a/other.ts'] }, { staged: ['src/features/a/legacy.ts'] }, 1, [formatStaleEntry(SCRATCH_BASELINE[0])]],
    ['an unstaged file drops its violation', { ...LEGACY, 'src/features/a/legacy.ts': 'export {};' }, { staged: ['src/features/a/other.ts'] }, 0, []],
    ['the whole tree sees an unstaged stale entry', { ...LEGACY, 'src/features/a/legacy.ts': 'export {};' }, { all: true }, 1, [formatStaleEntry(SCRATCH_BASELINE[0])]],
    ['a staged baseline checks the whole tree', { ...LEGACY, 'src/features/a/legacy.ts': 'export {};' }, { staged: ['async-state-baseline.json'] }, 1, [formatStaleEntry(SCRATCH_BASELINE[0])]],
    ['a staged file that does not parse keeps its entries', { ...LEGACY, 'src/features/a/legacy.ts': 'export const = ;' }, { staged: ['src/features/a/legacy.ts'] }, 1, ['cannot check, parse error:']],
    ['the whole tree keeps the entries of a file that does not parse', { ...LEGACY, 'src/features/a/legacy.ts': 'export const = ;' }, { all: true }, 1, ['cannot check, parse error:']],
  ])('%s', async (_name, sources, options, status, reported) => {
    /** Lines the run printed. */
    const lines = [];
    await expect(runAsyncStateGates({ root: scratchRoot(sources), log: (line) => lines.push(line), ...options })).resolves.toBe(status);
    expect(lines[0]).toMatch(/^async-state gates: baseline 2 entries \(no-infrastructure-import 1, no-runtime-subscription 1\); exceptions 0 entries \(none\); checked /u);
    expect(lines.slice(1)).toEqual(reported.map((start) => expect.stringMatching(new RegExp(`^${RegExp.escape(start)}`, 'u'))));
  });

  /** The check script, run as a CLI by the hooks. */
  const checkScript = path.join(frontendRoot, 'scripts', 'check-async-state-gates.mjs');

  it.each([
    ['the script path itself', checkScript, 'linux', true],
    ['the script path in another letter case on Windows', checkScript.toUpperCase(), 'win32', true],
    ['another file', path.join(frontendRoot, 'package.json'), 'win32', false],
    ['no script path', undefined, 'win32', false],
  ])('recognises the CLI entry for %s', (_name, argvPath, platform, expected) => {
    expect(isCliEntry(argvPath, pathToFileURL(checkScript).href, platform)).toBe(expected);
  });

  it.each([
    ['passes and prints the count', LEGACY, 0],
    ['fails on a new violation', { ...LEGACY, 'src/features/a/new.ts': 'const go = window.go;' }, 1],
  ])('runs as a CLI with --all and %s', (_name, sources, status) => {
    /** The CLI run over a scratch frontend root. */
    const run = spawnSync(process.execPath, [checkScript, '--all'], { cwd: scratchRoot(sources), encoding: 'utf8' });
    expect(run.status).toBe(status);
    expect(run.stdout).toMatch(/^async-state gates: baseline 2 entries/u);
  });

  /** One justified exception: the push subscription of src/features/a/push.ts. */
  const EXCEPTION = { rule: 'no-runtime-subscription', file: 'src/features/a/push.ts', symbol: 'subscribeArchived', reason: 'Push projection the registry cannot express.' };

  /** The legacy violations plus the excepted subscription. */
  const WITH_PUSH = { ...LEGACY, 'src/features/a/push.ts': 'source.subscribeArchived(() => {});' };

  /** The legacy violations, with the excepted subscription gone. */
  const WITHOUT_PUSH = { ...LEGACY, 'src/features/a/push.ts': 'export {};' };

  it.each([
    ['a staged file keeps its excepted violation', WITH_PUSH, { staged: ['src/features/a/push.ts'] }, 0, []],
    ['the whole tree keeps an excepted violation', WITH_PUSH, { all: true }, 0, []],
    ['a staged file drops its excepted violation', WITHOUT_PUSH, { staged: ['src/features/a/push.ts'] }, 1, [formatStaleException(EXCEPTION)]],
    ['the whole tree sees a stale exception', WITHOUT_PUSH, { all: true }, 1, [formatStaleException(EXCEPTION)]],
    ['an unstaged file drops its excepted violation', WITHOUT_PUSH, { staged: ['src/features/a/other.ts'] }, 0, []],
    ['a staged exception list checks the whole tree', WITHOUT_PUSH, { staged: ['async-state-exceptions.json'] }, 1, [formatStaleException(EXCEPTION)]],
  ])('%s', async (_name, sources, options, status, reported) => {
    /** Lines the run printed. */
    const lines = [];
    await expect(runAsyncStateGates({ root: scratchRoot(sources, [EXCEPTION]), log: (line) => lines.push(line), ...options })).resolves.toBe(status);
    expect(lines[0]).toMatch(/; exceptions 1 entries \(no-runtime-subscription 1\); checked /u);
    expect(lines.slice(1)).toEqual(reported);
  });

  it('names the exception file in a stale-exception line', () => {
    expect(formatStaleException(EXCEPTION)).toBe(
      'stale exception, no longer found; delete it from frontend/async-state-exceptions.json: {"rule":"no-runtime-subscription","file":"src/features/a/push.ts","symbol":"subscribeArchived"}',
    );
  });

  it.each([
    ['has no reason', { rule: EXCEPTION.rule, file: EXCEPTION.file, symbol: EXCEPTION.symbol }],
    ['has a blank reason', { ...EXCEPTION, reason: '   ' }],
    ['names no specifier or symbol', { rule: EXCEPTION.rule, file: EXCEPTION.file, reason: EXCEPTION.reason }],
    ['names an unknown rule', { ...EXCEPTION, rule: 'no-such-rule' }],
  ])('refuses to run when an exception %s', async (_name, exception) => {
    await expect(runAsyncStateGates({ root: scratchRoot(WITH_PUSH, [exception]), all: true, log: () => {} })).rejects.toThrow(
      /^async-state-exceptions\.json: /u,
    );
  });

  it('fails as a CLI when an exception has no reason', () => {
    /** Root whose one exception lacks its reason. */
    const root = scratchRoot(WITH_PUSH, [{ rule: EXCEPTION.rule, file: EXCEPTION.file, symbol: EXCEPTION.symbol }]);
    /** The CLI run over it. */
    const run = spawnSync(process.execPath, [checkScript, '--all'], { cwd: root, encoding: 'utf8' });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain('async-state-exceptions.json: an exception needs a written reason');
  });

  it('names the helper, the skill and the ADR in a new-violation message', async () => {
    /** Lines the run printed. */
    const lines = [];
    /** Root with one new runtime subscription. */
    const root = scratchRoot({ ...LEGACY, 'src/features/a/new.ts': "EventsOn('x', () => {});" });
    await runAsyncStateGates({ root, staged: ['src/features/a/new.ts'], log: (line) => lines.push(line) });
    expect(lines[1]).toContain('BRIDGE_INVALIDATIONS');
    expect(lines[1]).toContain('useBridgeQuery');
    expect(lines[1]).toContain('Skill: bridge-data');
    expect(lines[1]).toContain('ADR-032');
  });
});
