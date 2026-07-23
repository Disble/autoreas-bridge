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
