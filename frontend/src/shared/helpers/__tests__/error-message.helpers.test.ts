import { describe, expect, it } from 'vitest';
import { toErrorMessage } from '../error-message.helpers';

describe('toErrorMessage', () => {
  it('keeps the message of a real Error', () => {
    expect(toErrorMessage(new Error('boom'), 'fallback')).toBe('boom');
  });

  it('keeps a bare string rejection, which is how Wails surfaces a Go error', () => {
    expect(toErrorMessage('download readiness unavailable', 'fallback')).toBe('download readiness unavailable');
  });

  it('trims a string rejection before using it', () => {
    expect(toErrorMessage('  boom  ', 'fallback')).toBe('boom');
  });

  it('falls back when the rejection carries no usable text', () => {
    expect(toErrorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(toErrorMessage('   ', 'fallback')).toBe('fallback');
    expect(toErrorMessage(undefined, 'fallback')).toBe('fallback');
    expect(toErrorMessage(null, 'fallback')).toBe('fallback');
  });

  it('reads the message of an error-shaped object that is not an Error instance', () => {
    expect(toErrorMessage({ message: 'boom' }, 'fallback')).toBe('boom');
  });

  it('falls back for values with no meaningful text rather than printing [object Object]', () => {
    expect(toErrorMessage({ code: 500 }, 'fallback')).toBe('fallback');
    expect(toErrorMessage(42, 'fallback')).toBe('fallback');
  });
});
