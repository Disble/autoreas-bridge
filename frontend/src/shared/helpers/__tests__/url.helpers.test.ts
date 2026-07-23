import { describe, expect, it } from 'vitest';
import { isValidDownloadPageUrl } from '../url.helpers';

describe('isValidDownloadPageUrl', () => {
  it('accepts http and https URLs', () => {
    expect(isValidDownloadPageUrl('https://jkanime.net/frieren/')).toBe(true);
    expect(isValidDownloadPageUrl('http://example.test/a')).toBe(true);
    expect(isValidDownloadPageUrl('  https://example.test/a  ')).toBe(true);
  });

  it('rejects blank, non-URL text, and non-http(s) schemes', () => {
    expect(isValidDownloadPageUrl('')).toBe(false);
    expect(isValidDownloadPageUrl('   ')).toBe(false);
    expect(isValidDownloadPageUrl('jkanime.net/frieren')).toBe(false);
    expect(isValidDownloadPageUrl('not a url')).toBe(false);
    expect(isValidDownloadPageUrl('ftp://example.test/a')).toBe(false);
    expect(isValidDownloadPageUrl('javascript:alert(1)')).toBe(false);
  });
});
