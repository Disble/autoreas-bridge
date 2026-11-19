import { describe, expect, it } from 'vitest';
import { runHistoryLoad } from '../run-history-panel.helpers';

describe('runHistoryLoad', () => {
  it('maps each query state to its run history load', () => {
    const cases = [['loading', false, undefined], ['empty', true, undefined], ['ready', true, undefined], ['failure', true, 'broken']] as const;

    for (const [kind, hasLoaded, message] of cases) {
      const caseName = `maps ${String(kind)}`;
      expect.soft(runHistoryLoad(kind, new Error('broken')), caseName).toEqual({ hasLoaded, errorMessage: message });
    }
  });
});
