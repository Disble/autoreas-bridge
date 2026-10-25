/**
 * Returns true when `value` is a syntactically valid public http(s) URL — the
 * shape a download page must have. Blank is not valid here; callers that treat
 * the page as optional check emptiness before calling this. Kept in `shared`
 * so the create form and the edit form validate the field the same way.
 */
export function isValidDownloadPageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed === '') {
    return false;
  }
  try {
    const url = new URL(trimmed);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Opens `url` in the user's default browser through the Wails runtime, the way every "Open page"
 * action does. A WebView anchor (`target="_blank"`) would open a WebView2 popup instead. A blank URL
 * or a missing runtime (tests, a plain browser) opens nothing.
 */
export function openInDefaultBrowser(url: string): void {
  if (url === '' || typeof window.runtime?.BrowserOpenURL !== 'function') {
    return;
  }
  window.runtime.BrowserOpenURL(url);
}
