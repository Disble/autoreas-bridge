import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { BRIDGE_ERROR_CODES } from '../../../shared/query/bridge-error/bridge-error.constants';
import { findRepositoryFile } from '../../test-support/repository-file.test-support';
import { parseBridgeError, withBridgeErrors } from '../bridge-error.helpers';

/** `internal/apperr/error-codes.json`, the Go side's list of failure codes. */
const goErrorCodesPath = findRepositoryFile('internal/apperr/error-codes.json', import.meta.url);

describe('parseBridgeError', () => {
  it.each([
    ['a coded JSON failure', new Error('{"code":"unavailable","message":"episodes is starting"}'), 'unavailable', 'episodes is starting'],
    ['another known code', new Error('{"code":"failed_precondition","message":"episodes: db closed"}'), 'failed_precondition', 'episodes: db closed'],
    ['an unknown code', new Error('{"code":"teapot","message":"short and stout"}'), 'internal', '{"code":"teapot","message":"short and stout"}'],
    ['JSON without a string message', new Error('{"code":"not_found","message":7}'), 'internal', '{"code":"not_found","message":7}'],
    ['JSON that is not an object', new Error('"unavailable"'), 'internal', '"unavailable"'],
    ['JSON null', new Error('null'), 'internal', 'null'],
    ['a legacy plain message', new Error('anime not found'), 'internal', 'anime not found'],
    ['a Wails call timeout', new Error('Call to GetReadiness timed out. Request ID: 4'), 'internal', 'Call to GetReadiness timed out. Request ID: 4'],
    ['a non-Error string rejection', '{"code":"unavailable","message":"x"}', 'internal', '{"code":"unavailable","message":"x"}'],
    ['an undefined rejection', undefined, 'internal', 'undefined'],
  ])('%s → %s', (_label, rejection, code, message) => {
    expect(parseBridgeError(rejection)).toMatchObject({ name: 'BridgeError', code, message });
  });

  it('keeps a value that already is a BridgeError', () => {
    const coded = parseBridgeError(new Error('{"code":"not_found","message":"gone"}'));

    expect(parseBridgeError(coded)).toBe(coded);
  });
});

describe('withBridgeErrors', () => {
  it('passes a resolved value through untouched', async () => {
    await expect(withBridgeErrors(Promise.resolve(['row']))).resolves.toEqual(['row']);
  });

  it('rejects with the parsed BridgeError', async () => {
    const rejection = Promise.reject(new Error('{"code":"invalid_argument","message":"day is empty"}'));

    await expect(withBridgeErrors(rejection)).rejects.toMatchObject({ code: 'invalid_argument', message: 'day is empty' });
  });
});

describe('failure-code parity', () => {
  it('matches internal/apperr/error-codes.json exactly', () => {
    const goCodes = (JSON.parse(readFileSync(goErrorCodesPath, 'utf8')) as { codes: string[] }).codes;

    expect([...BRIDGE_ERROR_CODES]).toEqual(goCodes);
  });
});
