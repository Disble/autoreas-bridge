import { describe, expect, it } from 'vitest';

import { createBridgeError } from '../../bridge-error/bridge-error.helpers';
import type { AsyncViewSource } from '../async-view.types';
import { isEmptyByDefault, toAsyncView } from '../async-view.helpers';

/** A query result in `status`, with the remaining fields overridable. */
function query<TData>(status: AsyncViewSource<TData>['status'], fields: Partial<AsyncViewSource<TData>> = {}): AsyncViewSource<TData> {
  return { status, data: undefined, error: null, isFetching: false, ...fields };
}

describe('toAsyncView', () => {
  it.each([
    ['pending', query('pending', { isFetching: true }), { kind: 'loading' }],
    ['pending even with stale fields', query('pending', { data: ['row'] }), { kind: 'loading' }],
    ['a coded error', query('error', { error: createBridgeError('failed_precondition', 'episodes: db closed') }), { kind: 'failure', code: 'failed_precondition', message: 'episodes: db closed' }],
    ['an error that also kept data', query('error', { data: ['row'], error: createBridgeError('not_found', 'gone') }), { kind: 'failure', code: 'not_found', message: 'gone' }],
    ['an uncoded Error', query('error', { error: new Error('boom') }), { kind: 'failure', code: 'internal', message: 'boom' }],
    ['a non-Error rejection', query('error', { error: 'nope' }), { kind: 'failure', code: 'internal', message: 'nope' }],
    ['an empty array', query('success', { data: [] }), { kind: 'empty' }],
    ['an empty array while refetching', query('success', { data: [], isFetching: true }), { kind: 'empty' }],
    ['rows', query('success', { data: ['row'] }), { kind: 'ready', data: ['row'], isRefreshing: false }],
    ['rows while refetching', query('success', { data: ['row'], isFetching: true }), { kind: 'ready', data: ['row'], isRefreshing: true }],
    ['a non-array value', query('success', { data: { total: 0 } }), { kind: 'ready', data: { total: 0 }, isRefreshing: false }],
  ])('%s', (_label, source, expected) => {
    expect(toAsyncView(source)).toEqual(expected);
  });

  it('uses the caller predicate to decide emptiness', () => {
    const isEmpty = (data: { total: number }) => data.total === 0;

    expect(toAsyncView(query('success', { data: { total: 0 } }), isEmpty)).toEqual({ kind: 'empty' });
    expect(toAsyncView(query('success', { data: { total: 2 } }), isEmpty)).toMatchObject({ kind: 'ready' });
  });
});

describe('isEmptyByDefault', () => {
  it.each([
    [[], true],
    [['row'], false],
    [null, false],
    ['', false],
    [0, false],
    [{}, false],
  ])('%j → %s', (data, expected) => {
    expect(isEmptyByDefault(data)).toBe(expected);
  });
});
