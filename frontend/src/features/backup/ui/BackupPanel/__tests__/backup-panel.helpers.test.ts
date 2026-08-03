import { describe, expect, it } from 'vitest';
import type { BackupExportResultDTO } from '../../../../../infrastructure/backup-source/backup-source.types';
import { classifyExportOutcome, describeExportError, summarizeExportResult } from '../backup-panel.helpers';

function buildResult(overrides: Partial<BackupExportResultDTO> = {}): BackupExportResultDTO {
  return {
    cancelled: false,
    destinationPath: 'C:/backups/autoreas-backup-20260731-120000.zip',
    formatVersion: 1,
    createdAt: '2026-07-31T12:00:00Z',
    groups: [
      { name: 'anime_snapshots', recordCount: 512 },
      { name: 'seasons', recordCount: 1 },
      { name: 'season_animes', recordCount: 12 },
    ],
    bundleChecksum: 'deadbeef',
    ...overrides,
  };
}

describe('summarizeExportResult', () => {
  it('summarizes every group with its human-readable label and the destination path', () => {
    const summary = summarizeExportResult(buildResult());

    expect(summary).toBe('Exported 512 animes, 1 seasons, 12 season animes to C:/backups/autoreas-backup-20260731-120000.zip');
  });

  it('falls back to the raw group name for an unknown group', () => {
    const summary = summarizeExportResult(buildResult({ groups: [{ name: 'unknown_group', recordCount: 3 }] }));

    expect(summary).toBe('Exported 3 unknown_group to C:/backups/autoreas-backup-20260731-120000.zip');
  });

  it('summarizes zero groups without a dangling separator', () => {
    const summary = summarizeExportResult(buildResult({ groups: [] }));

    expect(summary).toBe('Exported nothing to C:/backups/autoreas-backup-20260731-120000.zip');
  });
});

describe('describeExportError', () => {
  it('returns the error message for an Error instance', () => {
    expect(describeExportError(new Error('save dialog failed'))).toBe('save dialog failed');
  });

  it('falls back to the unknown-error message for a blank Error message', () => {
    expect(describeExportError(new Error('   '))).toBe('Backup export failed unexpectedly.');
  });

  it('falls back to the unknown-error message for a non-Error value', () => {
    expect(describeExportError('boom')).toBe('Backup export failed unexpectedly.');
  });
});

describe('classifyExportOutcome', () => {
  it('reports busy while an export is running, regardless of prior result or error', () => {
    expect(classifyExportOutcome({ isExporting: true, result: buildResult(), errorMessage: 'stale error' })).toBe('busy');
  });

  it('reports error when the last export attempt failed', () => {
    expect(classifyExportOutcome({ isExporting: false, result: null, errorMessage: 'boom' })).toBe('error');
  });

  it('reports idle before any export has been attempted', () => {
    expect(classifyExportOutcome({ isExporting: false, result: null, errorMessage: null })).toBe('idle');
  });

  it('reports cancelled when the last result was a dismissed save dialog', () => {
    expect(classifyExportOutcome({ isExporting: false, result: buildResult({ cancelled: true }), errorMessage: null })).toBe('cancelled');
  });

  it('reports success when the last result completed without cancellation', () => {
    expect(classifyExportOutcome({ isExporting: false, result: buildResult({ cancelled: false }), errorMessage: null })).toBe('success');
  });
});
