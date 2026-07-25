import { describe, expect, it } from 'vitest';
import { isJsonCodeText, resolveCodeText, toPrettyCodeText } from '../code-block.helpers';

describe('isJsonCodeText', () => {
  it('returns true for a JSON object', () => {
    expect(isJsonCodeText('{"a":1}')).toBe(true);
  });

  it('returns true for a JSON array', () => {
    expect(isJsonCodeText('[1,2,3]')).toBe(true);
  });

  it('returns false for a numeric scalar', () => {
    expect(isJsonCodeText('123')).toBe(false);
  });

  it('returns false for a string scalar', () => {
    expect(isJsonCodeText('"text"')).toBe(false);
  });

  it('returns false for a boolean scalar', () => {
    expect(isJsonCodeText('true')).toBe(false);
  });

  it('returns false for a null scalar', () => {
    expect(isJsonCodeText('null')).toBe(false);
  });

  it('returns false for an empty string', () => {
    expect(isJsonCodeText('')).toBe(false);
  });

  it('returns false for non-JSON text', () => {
    expect(isJsonCodeText('Internal Server Error')).toBe(false);
  });
});

describe('toPrettyCodeText', () => {
  it('returns two-space indented JSON for an object', () => {
    const raw = '{"a":1,"b":[2,3]}';
    expect(toPrettyCodeText(raw)).toBe(JSON.stringify(JSON.parse(raw), null, 2));
  });

  it('returns the untouched string for non-JSON text', () => {
    expect(toPrettyCodeText('Internal Server Error')).toBe('Internal Server Error');
  });
});

describe('resolveCodeText', () => {
  it('is byte-identical to raw for the raw view, including whitespace and key order', () => {
    const raw = '{ "b": 2,  "a":1 }';
    expect(resolveCodeText(raw, 'raw')).toBe(raw);
  });

  it('returns the pretty form for the pretty view on JSON', () => {
    const raw = '{"a":1}';
    expect(resolveCodeText(raw, 'pretty')).toBe(JSON.stringify(JSON.parse(raw), null, 2));
  });

  it('falls back to raw for the pretty view on non-JSON text', () => {
    expect(resolveCodeText('Internal Server Error', 'pretty')).toBe('Internal Server Error');
  });
});
