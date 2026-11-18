import { describe, expect, it } from 'vitest';

describe('activity-source', () => {
  it('shares one source instance', async () => {
    const { createActivitySource } = await import('../activity-source.helpers');

    expect(createActivitySource()).toBe(createActivitySource());
  });
});
