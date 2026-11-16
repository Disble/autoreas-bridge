import { describe, expect, it } from 'vitest';
import { scheduleLoadStatus } from '../schedule-panel.helpers';

describe('scheduleLoadStatus', () => {
  it.each([['loading', 'loading'], ['empty', 'loading'], ['failure', 'error'], ['ready', 'ready']] as const)(
    'maps %s to %s', (kind, expected) => expect(scheduleLoadStatus(kind)).toBe(expected),
  );
});
