import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import auditConfig from '../../stryker.audit.config.mjs';
import { summarizeMutationAudit } from '../summarize-mutation-audit.mjs';

/**
 * Minimal stored-shape report carrying the actual Stryker status field.
 * @param {...string} statuses Mutant statuses.
 * @returns {object} Report with one production file.
 */
function reportFor(...statuses) {
  return { files: { 'src/example.ts': { mutants: statuses.map((status) => ({ status })) } } };
}

/** Real CLI path, so exit-code assertions exercise the process boundary. */
const cli = fileURLToPath(new URL('../summarize-mutation-audit.mjs', import.meta.url));

describe('mutation audit reports', () => {
  it('preserves the actual Vitest runner and strict audit configuration', () => {
    expect(auditConfig.testRunner).toBe('vitest');
    expect(auditConfig.vitest.configFile).toBe('vitest.mutation.mts');
    expect(auditConfig.ignoreStatic).toBe(true);
    expect(auditConfig.reporters).toEqual(expect.arrayContaining(['html', 'json']));
    expect(auditConfig.thresholds.break).toBe(100);
  });

  it.each([
    [['Killed', 'Timeout'], 0], [['Survived'], 1], [['NoCoverage'], 1],
    [['Ignored'], 1], [['Pending'], 1], [[], 1],
  ])('returns a real process verdict for %j', (statuses, expected) => {
    /** Isolated stored report location. */
    const directory = mkdtempSync(path.join(os.tmpdir(), 'bridge-mutation-report-'));
    try {
      mkdirSync(path.join(directory, 'reports', 'mutation'), { recursive: true });
      writeFileSync(path.join(directory, 'reports', 'mutation', 'audit.json'), JSON.stringify(reportFor(...statuses)));
      /** No mocked status handling: the report CLI actually exits. */
      const result = spawnSync(process.execPath, [cli], { cwd: directory, encoding: 'utf8' });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(expected);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
  it('counts executed mutants separately from ignored and compile errors', () => {
    expect(summarizeMutationAudit(reportFor('Killed', 'Timeout', 'Ignored', 'CompileError'))).toMatchObject({
      eligible: 2, Killed: 1, Timeout: 1, Ignored: 1, CompileError: 1,
    });
  });

  it.each(['Survived', 'NoCoverage'])('retains %s for the retrospective failure verdict', (status) => {
    expect(summarizeMutationAudit(reportFor(status))).toMatchObject({ eligible: 1, [status]: 1 });
  });

  it.each([undefined, {}, { files: {} }, reportFor('Ignored'), reportFor('CompileError')])(
    'refuses absent or untested reports: %j', (report) => {
      expect(() => summarizeMutationAudit(report)).toThrow();
    },
  );

  it.each(['Pending', 'RuntimeError', 'unknown'])('refuses incomplete execution status %s', (status) => {
    expect(() => summarizeMutationAudit(reportFor('Killed', status))).toThrow('Incomplete');
  });

  it('refuses malformed per-file mutant data', () => {
    expect(() => summarizeMutationAudit({ files: { 'src/x.ts': {} } })).toThrow('Invalid');
  });
});
