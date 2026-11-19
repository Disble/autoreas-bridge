import { describe, expect, it } from 'vitest';

import { createBridgeError, isBridgeError } from '../bridge-error.helpers';

describe('createBridgeError', () => {
  it('builds an Error carrying the code, the message and the BridgeError name', () => {
    const error = createBridgeError('not_found', 'anime a-1 not found');

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'BridgeError', code: 'not_found', message: 'anime a-1 not found' });
  });
});

describe('isBridgeError', () => {
  /** An Error renamed to BridgeError but carrying the given code. */
  function namedError(code: unknown): Error {
    return Object.assign(new Error('x'), { name: 'BridgeError', code });
  }

  it.each([
    ['a created BridgeError', createBridgeError('unavailable', 'starting'), true],
    ['an Error with a code but another name', Object.assign(new Error('x'), { code: 'internal' }), false],
    ['a BridgeError-named Error with an unknown code', namedError('teapot'), false],
    ['a plain object shaped like one', { name: 'BridgeError', code: 'internal', message: 'x' }, false],
  ])('%s → %s', (_label, value, expected) => {
    expect(isBridgeError(value)).toBe(expected);
  });
});
