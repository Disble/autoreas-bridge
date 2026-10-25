import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidDownloadPageUrl, openInDefaultBrowser } from '../url.helpers';

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

describe('openInDefaultBrowser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hands the URL to the Wails runtime, which opens the default browser', () => {
    const browserOpenURL = vi.fn();
    vi.stubGlobal('window', { runtime: { BrowserOpenURL: browserOpenURL } });

    openInDefaultBrowser('https://www.mediafire.com/file/a');

    expect(browserOpenURL).toHaveBeenCalledExactlyOnceWith('https://www.mediafire.com/file/a');
  });

  it('opens nothing for a blank URL', () => {
    const browserOpenURL = vi.fn();
    vi.stubGlobal('window', { runtime: { BrowserOpenURL: browserOpenURL } });

    openInDefaultBrowser('');

    expect(browserOpenURL).not.toHaveBeenCalled();
  });

  it('does nothing outside the Wails runtime', () => {
    vi.stubGlobal('window', {});

    expect(() => openInDefaultBrowser('https://example.test/a')).not.toThrow();
  });
});
