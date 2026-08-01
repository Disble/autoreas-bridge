import { describe, expect, it } from 'vitest';
import type { BackupImportPreviewDTO, BackupImportResultDTO } from '../../../../../infrastructure/backup-source';
import { classifyImportPhase, describeImportOutcome, summarizeImportPreview } from '../backup-import-section.helpers';
import type { ImportPhaseInput } from '../backup-import-section.types';

const basePhaseInput: ImportPhaseInput = {
  isPreviewing: false,
  isApplying: false,
  preview: null,
  result: null,
  errorMessage: null,
};

const basePreview: BackupImportPreviewDTO = {
  cancelled: false,
  bundlePath: 'C:/backups/autoreas-backup-20260731-120000.zip',
  formatVersion: 1,
  bridgeVersion: 'dev',
  createdAt: '2026-07-31T12:00:00Z',
  bundleChecksum: 'deadbeef',
  groups: [{ name: 'anime_snapshots', recordCount: 512 }],
  unknownGroups: [],
  absentGroups: [],
  versionNotes: [],
};

const baseResult: BackupImportResultDTO = {
  importedGroups: [{ name: 'anime_snapshots', recordCount: 512 }],
  failedGroup: '',
  unattemptedGroups: [],
  restorePointPath: 'C:/data/bridge-restore-point-20260731-120000.db',
  errorMessage: '',
};

describe('classifyImportPhase', () => {
  it('returns idle when nothing has happened yet', () => {
    expect(classifyImportPhase(basePhaseInput)).toBe('idle');
  });

  it('returns previewing while a preview is in flight', () => {
    expect(classifyImportPhase({ ...basePhaseInput, isPreviewing: true })).toBe('previewing');
  });

  it('returns applying while an apply is in flight, even with a stale preview', () => {
    expect(classifyImportPhase({ ...basePhaseInput, isApplying: true, preview: basePreview })).toBe('applying');
  });

  it('busy wins over a stale preview: previewing beats an already-produced preview', () => {
    expect(classifyImportPhase({ ...basePhaseInput, isPreviewing: true, preview: basePreview })).toBe('previewing');
  });

  it('returns previewed once a non-cancelled preview is available', () => {
    expect(classifyImportPhase({ ...basePhaseInput, preview: basePreview })).toBe('previewed');
  });

  it('returns idle for a cancelled dialog, not previewed', () => {
    expect(classifyImportPhase({ ...basePhaseInput, preview: { ...basePreview, cancelled: true } })).toBe('idle');
  });

  it('returns failed when an error message is set', () => {
    expect(classifyImportPhase({ ...basePhaseInput, errorMessage: 'boom' })).toBe('failed');
  });

  it('returns applied once a result is available with no error', () => {
    expect(classifyImportPhase({ ...basePhaseInput, result: baseResult })).toBe('applied');
  });
});

describe('summarizeImportPreview', () => {
  it('lists per-group record counts using their human-readable labels', () => {
    const summary = summarizeImportPreview(basePreview);
    expect(summary.groupLines).toEqual(['512 animes']);
  });

  it('reports the zero-groups case distinctly', () => {
    const summary = summarizeImportPreview({ ...basePreview, groups: [] });
    expect(summary.groupLines).toEqual(['This bundle carries no group this build knows.']);
  });

  it('renders absent groups as left untouched, never as will be emptied', () => {
    const summary = summarizeImportPreview({ ...basePreview, absentGroups: ['seasons', 'season_animes'] });
    expect(summary.untouchedLine).toContain('seasons');
    expect(summary.untouchedLine).toContain('season animes');
    expect(summary.untouchedLine?.toLowerCase()).not.toContain('empt');
  });

  it('returns a null untouched line when nothing is absent', () => {
    const summary = summarizeImportPreview(basePreview);
    expect(summary.untouchedLine).toBeNull();
  });

  it('renders unknown groups as ignored', () => {
    const summary = summarizeImportPreview({ ...basePreview, unknownGroups: ['future_table'] });
    expect(summary.ignoredLine).toContain('future_table');
  });

  it('lists version notes verbatim', () => {
    const summary = summarizeImportPreview({ ...basePreview, versionNotes: ['v2 added foo'] });
    expect(summary.versionNoteLines).toEqual(['v2 added foo']);
  });
});

describe('describeImportOutcome', () => {
  it('summarizes a full success by imported group counts', () => {
    expect(describeImportOutcome(baseResult, null)).toContain('512 animes');
  });

  it('names the failed group, the committed groups, and the restore point path on partial failure', () => {
    const partial: BackupImportResultDTO = {
      importedGroups: [{ name: 'anime_snapshots', recordCount: 512 }],
      failedGroup: 'seasons',
      unattemptedGroups: ['season_animes'],
      restorePointPath: 'C:/data/bridge-restore-point-20260731-120000.db',
      errorMessage: 'insert record 1: UNIQUE constraint failed',
    };

    const message = describeImportOutcome(partial, null);
    expect(message).toContain('seasons');
    expect(message).toContain('animes');
    expect(message).toContain('season animes');
    expect(message).toContain('C:/data/bridge-restore-point-20260731-120000.db');
  });

  it('falls back to a generic message for a blank or non-Error rejection with no result', () => {
    expect(describeImportOutcome(null, 'not an Error instance')).toBe('Backup import failed unexpectedly.');
    expect(describeImportOutcome(null, new Error(''))).toBe('Backup import failed unexpectedly.');
  });

  it('surfaces a thrown Error message when there is no result at all', () => {
    expect(describeImportOutcome(null, new Error('dialog failed'))).toBe('dialog failed');
  });
});
