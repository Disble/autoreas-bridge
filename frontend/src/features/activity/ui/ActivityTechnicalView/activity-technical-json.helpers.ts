import { ACTIVITY_JSON_STRING_PATTERN } from './activity-technical-view.constants';
import type { ActivityJsonToken } from './activity-technical-view.types';

/**
 * Indents a stored body two spaces deep when it parses as JSON; any other
 * text, a truncated body included, stays exactly as stored.
 *
 * @param raw The stored body.
 * @returns The text to show.
 */
export function prettyActivityJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

/**
 * Splits a body into the runs the mockup's tokenizer colours: a string before
 * a colon is a key, a string after `: ` is a value, everything else is plain.
 *
 * @param raw The stored body.
 * @returns The runs, in order; joined they give back the shown text.
 */
export function toActivityJsonTokens(raw: string): readonly ActivityJsonToken[] {
  const text = prettyActivityJson(raw);
  const tokens: ActivityJsonToken[] = [];
  let last = 0;
  for (const match of text.matchAll(ACTIVITY_JSON_STRING_PATTERN)) {
    const start = match.index;
    const end = start + match[0].length;
    const kind = /^\s*:/.test(text.slice(end)) ? 'key' : text.slice(0, start).endsWith(': ') ? 'string' : undefined;
    if (kind === undefined) {
      continue;
    }
    if (start > last) {
      tokens.push({ kind: 'plain', offset: last, text: text.slice(last, start) });
    }
    tokens.push({ kind, offset: start, text: match[0] });
    last = end;
  }
  if (last < text.length) {
    tokens.push({ kind: 'plain', offset: last, text: text.slice(last) });
  }
  return tokens;
}
