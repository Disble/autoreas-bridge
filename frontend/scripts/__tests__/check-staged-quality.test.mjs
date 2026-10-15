import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { runStagedQuality } from '../check-staged-quality.mjs';

/** Actual workspace used to check the installed local dependency boundary. */
const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('staged quality entry point', () => {
  it('fails before invoking dharness when local ESLint is absent', async () => {
    /** Empty workspace with no local dependencies. */
    const directory = mkdtempSync(path.join(os.tmpdir(), 'bridge-quality-'));
    /** Spy proving missing dependencies cannot silently skip lint. */
    const run = vi.fn();
    try {
      await expect(runStagedQuality(directory, run)).rejects.toThrow('Local ESLint is missing');
      expect(run).not.toHaveBeenCalled();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('refuses a dependency whose CLI shim is missing', async () => {
    /** A damaged install with an ESLint package but no binary for dharness to resolve. */
    const directory = mkdtempSync(path.join(os.tmpdir(), 'bridge-quality-shim-'));
    try {
      mkdirSync(path.join(directory, 'node_modules', 'eslint', 'bin'), { recursive: true });
      writeFileSync(path.join(directory, 'node_modules', 'eslint', 'bin', 'eslint.js'), '');
      await expect(runStagedQuality(directory)).rejects.toThrow('Local ESLint is missing');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each([0, 1, 2, null])('preserves dharness status %s after validating config', async (status) => {
    /** Child-process result, independent of mutation or lint findings. */
    const run = vi.fn(() => ({ status }));
    /** Config loader proves the preflight runs before dharness without transforming its plugins. */
    const loadConfig = vi.fn(async () => ({}));
    await expect(runStagedQuality(frontendRoot, run, loadConfig)).resolves.toBe(status ?? 1);
    expect(loadConfig).toHaveBeenCalledExactlyOnceWith(frontendRoot);
    expect(run).toHaveBeenCalledExactlyOnceWith(
      process.platform === 'win32' ? 'dharness.exe' : 'dharness',
      ['check'],
      { cwd: frontendRoot, stdio: 'inherit' },
    );
  });

  it('rejects an ignored entry before dharness runs', async () => {
    /** Spy proves invalid configuration cannot be hidden by dharness's empty-scope success. */
    const run = vi.fn();
    await expect(runStagedQuality(frontendRoot, run, async () => undefined)).rejects.toThrow('ignored by ESLint');
    expect(run).not.toHaveBeenCalled();
  });

  it('does not turn an unavailable dharness process into success', async () => {
    /** Process launch failure, rather than a completed check. */
    const error = new Error('spawn failed');
    await expect(runStagedQuality(frontendRoot, () => ({ error }), async () => ({}))).rejects.toThrow('spawn failed');
  });
});
