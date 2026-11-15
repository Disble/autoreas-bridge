import { toAsyncView } from '../../../shared/query/async-view/async-view.helpers';
import type { AsyncView, AsyncViewSource } from '../../../shared/query/async-view/async-view.types';
import type { ActivityReadStatus } from './activity-feed.types';

/**
 * The request status of a feed or overview query: loading while it is pending,
 * and while a failed read is read again ("Try again"); ready once it answered,
 * and after a failed refresh that still holds an earlier answer, so a refresh
 * never takes the shown rows or bars away; failed when nothing was answered.
 *
 * @param view The query's async view.
 * @param hasData Whether the query still holds an answer to show.
 * @param isFetching Whether the query is reading right now.
 * @returns The status the screen renders.
 */
export function toActivityQueryStatus<T>(view: AsyncView<T>, hasData: boolean, isFetching: boolean): ActivityReadStatus {
  if (view.kind === 'loading') {
    return 'loading';
  }
  if (view.kind !== 'failure' || hasData) {
    return 'ready';
  }
  return isFetching ? 'loading' : 'failed';
}

/**
 * The request status of the feed's first page: ready without a query (nothing
 * is read); loading while the previous query's page stands in as a
 * placeholder, so a new query never shows another query's rows as its own;
 * `toActivityQueryStatus` otherwise.
 *
 * @param hasQuery Whether a query is read (a type is selected).
 * @param page The first-page query.
 * @returns The status the feed renders.
 */
export function toActivityFeedPageStatus<T>(hasQuery: boolean, page: AsyncViewSource<T> & { readonly isPlaceholderData: boolean }): ActivityReadStatus {
  if (!hasQuery) {
    return 'ready';
  }
  return page.isPlaceholderData ? 'loading' : toActivityQueryStatus(toAsyncView(page, () => false), page.data !== undefined, page.isFetching);
}

/**
 * Whether the scroll may read the next older page: a cursor remains, no older
 * page of this query is being read, and the page is near its bottom.
 *
 * @param cursor The cursor after the shown lines; empty when nothing older remains.
 * @param isLoadingThisQuery Whether an older page of the current query is being read.
 * @param isNearBottom Whether the page is near its bottom.
 * @returns True when the next older page should be read.
 */
export function shouldLoadOlderFeedPage(cursor: string, isLoadingThisQuery: boolean, isNearBottom: boolean): boolean {
  return cursor !== '' && !isLoadingThisQuery && isNearBottom;
}
