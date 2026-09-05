/**
 * Strips trailing dots and spaces, which Windows silently drops from a folder
 * name. Without this the UI would preview a path the filesystem never creates.
 * @param value Candidate folder-name segment.
 * @returns The segment with trailing `.` and ` ` removed.
 */
function trimTrailingWindowsNameCharacters(value: string): string {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '.' || value[end - 1] === ' ')) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Removes trailing path separators so joining a root with a segment cannot
 * produce a doubled slash.
 * @param value Candidate path root.
 * @returns The root without trailing `/` or `\`.
 */
function trimTrailingPathSeparators(value: string): string {
  let end = value.length;
  while (end > 0 && (value[end - 1] === '/' || value[end - 1] === '\\')) {
    end -= 1;
  }
  return value.slice(0, end);
}

/**
 * Mirrors the backend's default download-folder derivation so any surface (season
 * intake, manual create) can preview the exact folder creation will request:
 * downloads root plus a Windows-safe anime-name segment. Returns `''` when the
 * root is empty or the name sanitizes to nothing.
 */
export function deriveDownloadFolder(root: string, name: string): string {
  if (root === '') {
    return '';
  }
  // Windows-illegal filename chars plus ASCII control chars (U+0000-U+001F).
  // A literal rather than the RegExp constructor it used to be: the unicode escape
  // is an escape in both forms, so the constructor bought nothing except a second
  // level of backslashes. Mirrors the backend sanitizeFolderName
  // (internal/season/folder.go).
  const illegalFolderChars = /[<>:"/\\|?*\u0000-\u001f]/g;
  const segment = name
    .replace(illegalFolderChars, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
  const sanitizedSegment = trimTrailingWindowsNameCharacters(segment);
  if (sanitizedSegment === '') {
    return '';
  }
  const separator = root.includes('\\') ? '\\' : '/';
  return `${trimTrailingPathSeparators(root)}${separator}${sanitizedSegment}`;
}
