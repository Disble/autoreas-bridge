import type { CodeBlockView } from './code-block.types';

/**
 * Reports whether raw text parses as a JSON **object or array**. Scalars
 * (`number`, `string`, `boolean`, `null`) deliberately return false: pretty-
 * printing a scalar produces the same string as the raw form, so offering a
 * Pretty/Raw toggle for one would be a no-op control that lies about there
 * being two views.
 */
export function isJsonCodeText(raw: string): boolean {
  if (raw === '') {
    return false;
  }

  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null;
  } catch {
    return false;
  }
}

/** Returns `JSON.stringify(JSON.parse(raw), null, 2)`, or raw unchanged when it is not JSON. */
export function toPrettyCodeText(raw: string): string {
  if (!isJsonCodeText(raw)) {
    return raw;
  }

  return JSON.stringify(JSON.parse(raw), null, 2);
}

/** Resolves the text to display for a view, defaulting to raw when pretty is unavailable. */
export function resolveCodeText(raw: string, view: CodeBlockView): string {
  return view === 'pretty' ? toPrettyCodeText(raw) : raw;
}
