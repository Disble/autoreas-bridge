import { describe, expect, it } from 'vitest';

import { createBridgeError } from '../../bridge-error/bridge-error.helpers';
import { bridgeRetryDelay, createBridgeQueryClient, shouldRetryBridgeQuery } from '../query-client.helpers';

describe('shouldRetryBridgeQuery', () => {
  it.each([
    ['unavailable, first failure', 0, createBridgeError('unavailable', 'starting'), true],
    ['unavailable, last allowed retry', 3, createBridgeError('unavailable', 'starting'), true],
    ['unavailable, retries spent', 4, createBridgeError('unavailable', 'starting'), false],
    ['failed_precondition', 0, createBridgeError('failed_precondition', 'db closed'), false],
    ['invalid_argument', 0, createBridgeError('invalid_argument', 'bad day'), false],
    ['not_found', 0, createBridgeError('not_found', 'gone'), false],
    ['internal', 0, createBridgeError('internal', 'boom'), false],
    ['an uncoded Error', 0, new Error('unavailable'), false],
  ])('%s → %s', (_label, failureCount, error, expected) => {
    expect(shouldRetryBridgeQuery(failureCount, error)).toBe(expected);
  });
});

describe('bridgeRetryDelay', () => {
  it.each([
    [0, 500],
    [1, 1000],
    [2, 2000],
    [3, 4000],
    [4, 4000],
  ])('waits %s → %sms', (failureCount, expected) => {
    expect(bridgeRetryDelay(failureCount)).toBe(expected);
  });
});

describe('createBridgeQueryClient', () => {
  it('applies the IPC defaults to queries and never retries mutations', () => {
    const defaults = createBridgeQueryClient().getDefaultOptions();

    expect(defaults.queries).toMatchObject({
      networkMode: 'always',
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: shouldRetryBridgeQuery,
      retryDelay: bridgeRetryDelay,
    });
    expect(defaults.mutations).toMatchObject({ networkMode: 'always', retry: false });
  });

  it('builds an independent client on every call', () => {
    expect(createBridgeQueryClient()).not.toBe(createBridgeQueryClient());
  });
});
