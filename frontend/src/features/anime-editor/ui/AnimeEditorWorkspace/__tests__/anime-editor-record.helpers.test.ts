import { describe, expect, it } from 'vitest';
import { createBridgeError } from '../../../../../shared/query/bridge-error/bridge-error.helpers';
import type { AnimeEditorRecord } from '../../../../../shared/contracts/anime.types';
import { toAnimeEditorSettledRecordRead, toShownRecordLoadError } from '../anime-editor-record.helpers';
import type { AnimeEditorRecordQueryRead } from '../anime-editor-workspace.types';

/** A saved record stand-in; the helper passes it through untouched. */
const RECORD = { animeId: 'anime-1' } as AnimeEditorRecord;

/** A settled successful read of {@link RECORD}. */
const SUCCESS: AnimeEditorRecordQueryRead = {
  status: 'success',
  isFetching: false,
  isPlaceholderData: false,
  dataUpdatedAt: 10,
  errorUpdatedAt: 0,
  data: { outcome: 'applied', message: '', record: RECORD },
  error: null,
};

describe('toAnimeEditorSettledRecordRead', () => {
  it('holds back a read that is fetching, placeholder or not yet answered', () => {
    expect(toAnimeEditorSettledRecordRead({ ...SUCCESS, isFetching: true })).toBeUndefined();
    expect(toAnimeEditorSettledRecordRead({ ...SUCCESS, isPlaceholderData: true })).toBeUndefined();
    expect(toAnimeEditorSettledRecordRead({ ...SUCCESS, status: 'pending', data: undefined })).toBeUndefined();
  });

  it('hands a settled success its record and a stamp naming that read', () => {
    expect(toAnimeEditorSettledRecordRead(SUCCESS)).toEqual({ stamp: 'success:10:0', selectedRecord: RECORD, recordLoadError: undefined });
  });

  it('hands a failed read its message and no record, even with stale data', () => {
    const failed = toAnimeEditorSettledRecordRead({
      ...SUCCESS,
      status: 'error',
      errorUpdatedAt: 20,
      error: createBridgeError('unavailable', 'The anime module failed to start.'),
    });

    expect(failed).toEqual({ stamp: 'error:10:20', selectedRecord: undefined, recordLoadError: 'The anime module failed to start.' });
  });
});

describe('toShownRecordLoadError', () => {
  it('hides the failure while the record reads again and shows it once settled', () => {
    expect(toShownRecordLoadError(true, 'The anime module failed to start.')).toBeUndefined();
    expect(toShownRecordLoadError(false, 'The anime module failed to start.')).toBe('The anime module failed to start.');
  });
});
