import { describe, expect, it } from 'vitest';
import { scheduleLoadStatus } from '../schedule-panel.helpers';

describe('scheduleLoadStatus', () => {
  it('maps each query state to its schedule status', () => {
    const cases = [['loading', 'loading'], ['empty', 'loading'], ['failure', 'error'], ['ready', 'ready']] as const;

    for (const [kind, expected] of cases) {
      const caseName = `maps ${String(kind)} to ${String(expected)}`;
      expect.soft(scheduleLoadStatus(kind), caseName).toBe(expected);
    }
  });
});
