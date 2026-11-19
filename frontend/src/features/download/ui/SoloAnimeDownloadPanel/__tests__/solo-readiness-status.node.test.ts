import { describe, expect, it } from 'vitest';
import { soloReadinessStatus } from '../solo-anime-download-panel.helpers';

describe('soloReadinessStatus', () => {
  it('maps each readiness state to its status', () => {
    const cases = [['loading', 'loading', 'old'], ['failure', 'readiness-error', 'broken'], ['ready', 'success', 'old'], ['empty', 'success', 'old']] as const;

    for (const [kind, status, errorMessage] of cases) {
      const caseName = `maps ${String(kind)}`;
      expect.soft(soloReadinessStatus(kind, 'success', 'old', new Error('broken')), caseName).toEqual({ status, errorMessage });
    }
  });
});
