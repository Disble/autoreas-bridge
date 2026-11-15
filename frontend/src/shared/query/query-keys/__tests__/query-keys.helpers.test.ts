import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { defineQueryKeys } from '../query-keys.helpers';

describe('defineQueryKeys', () => {
  it('prefixes every key with the context so `all` invalidates the whole context', async () => {
    const episodesKeys = defineQueryKeys('episodes');
    const client = new QueryClient();
    client.setQueryData(episodesKeys.key('schedule', 'monday'), ['row']);
    client.setQueryData(['anime', 'list'], ['other']);

    await client.invalidateQueries({ queryKey: episodesKeys.all });

    expect(episodesKeys.all).toEqual(['episodes']);
    expect(episodesKeys.key('schedule', 'monday')).toEqual(['episodes', 'schedule', 'monday']);
    expect(client.getQueryState(episodesKeys.key('schedule', 'monday'))?.isInvalidated).toBe(true);
    expect(client.getQueryState(['anime', 'list'])?.isInvalidated).toBe(false);
  });
});
