import { describe, expect, it } from 'vitest';
import { toActivityTabId } from '../activity-screen.helpers';

describe('toActivityTabId', () => {
  it.each(['now', 'incidents', 'history'])('keeps the %s tab', (key) => {
    expect(toActivityTabId(key)).toBe(key);
  });

  it.each(['overview', 'transactions', 'runtime-events', 7])('falls back to Now for %s', (key) => {
    expect(toActivityTabId(key)).toBe('now');
  });
});
