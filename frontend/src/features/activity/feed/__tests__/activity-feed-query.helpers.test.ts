import { describe, expect, it } from 'vitest';
import type { AsyncView } from '../../../../shared/query/async-view/async-view.types';
import { shouldLoadOlderFeedPage, toActivityFeedPageStatus, toActivityQueryStatus } from '../activity-feed-query.helpers';
import type { ActivityReadStatus } from '../activity-feed.types';

/** A failed query view. */
const FAILURE: AsyncView<number> = { kind: 'failure', code: 'failed_precondition', message: 'observability: db closed' };

describe('toActivityQueryStatus', () => {
  it.each<[string, AsyncView<number>, boolean, boolean, ActivityReadStatus]>([
    ['pending', { kind: 'loading' }, false, true, 'loading'],
    ['answered', { kind: 'ready', data: 1, isRefreshing: false }, true, false, 'ready'],
    ['answered and refreshing', { kind: 'ready', data: 1, isRefreshing: true }, true, true, 'ready'],
    ['failed with nothing answered', FAILURE, false, false, 'failed'],
    ['failed and read again', FAILURE, false, true, 'loading'],
    ['failed on a refresh that still holds an answer', FAILURE, true, false, 'ready'],
  ])('shows a query that is %s as its status', (_label, view, hasData, isFetching, expected) => {
    expect(toActivityQueryStatus(view, hasData, isFetching)).toBe(expected);
  });
});

describe('toActivityFeedPageStatus', () => {
  /** An answered first page. */
  const ANSWERED = { status: 'success', data: 1, error: null, isFetching: false, isPlaceholderData: false } as const;

  it('is ready without a query, whatever the page holds', () => {
    expect(toActivityFeedPageStatus(false, { ...ANSWERED, status: 'pending', data: undefined })).toBe('ready');
  });

  it('is loading while another query page stands in as a placeholder', () => {
    expect(toActivityFeedPageStatus(true, { ...ANSWERED, isFetching: true, isPlaceholderData: true })).toBe('loading');
  });

  it('follows the query otherwise', () => {
    expect(toActivityFeedPageStatus(true, ANSWERED)).toBe('ready');
    expect(toActivityFeedPageStatus(true, { ...ANSWERED, status: 'error', data: undefined, error: new Error('boom') })).toBe('failed');
  });
});

describe('shouldLoadOlderFeedPage', () => {
  it.each<[string, string, boolean, boolean, boolean]>([
    ['a cursor remains, nothing loads and the page is near its bottom', 'c1', false, true, true],
    ['nothing older remains', '', false, true, false],
    ['an older page of this query is loading', 'c1', true, true, false],
    ['the page is far from its bottom', 'c1', false, false, false],
  ])('reads the next older page only when %s', (_label, cursor, isLoading, isNearBottom, expected) => {
    expect(shouldLoadOlderFeedPage(cursor, isLoading, isNearBottom)).toBe(expected);
  });
});
