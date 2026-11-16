import { describe, expect, it } from 'vitest';
import { runHistoryLoad } from '../run-history-panel.helpers';

describe('runHistoryLoad', () => {
  it.each([['loading', false, undefined], ['empty', true, undefined], ['ready', true, undefined], ['failure', true, 'broken']] as const)(
    'maps %s', (kind, hasLoaded, message) => expect(runHistoryLoad(kind, new Error('broken'))).toEqual({ hasLoaded, errorMessage: message }),
  );
});
