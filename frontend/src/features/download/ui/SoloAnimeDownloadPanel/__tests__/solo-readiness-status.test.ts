import { describe, expect, it } from 'vitest';
import { soloReadinessStatus } from '../solo-anime-download-panel.helpers';

describe('soloReadinessStatus', () => {
  it.each([['loading', 'loading', 'old'], ['failure', 'readiness-error', 'broken'], ['ready', 'success', 'old'], ['empty', 'success', 'old']] as const)(
    'maps %s', (kind, status, errorMessage) => expect(soloReadinessStatus(kind, 'success', 'old', new Error('broken'))).toEqual({ status, errorMessage }),
  );
});
