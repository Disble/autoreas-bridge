import { describe, expect, it } from 'vitest';
import { prettyActivityJson, toActivityJsonTokens } from '../activity-technical-json.helpers';

describe('prettyActivityJson', () => {
  it.each([
    ['indents a JSON body two spaces deep', '{"a":1}', '{\n  "a": 1\n}'],
    ['keeps a cut body exactly as stored', '{"a":"tru', '{"a":"tru'],
  ])('%s', (_name, raw, expected) => {
    expect(prettyActivityJson(raw)).toBe(expected);
  });
});

describe('toActivityJsonTokens', () => {
  it('colours keys and string values and leaves numbers, booleans and punctuation plain', () => {
    const tokens = toActivityJsonTokens('{"status":"ok","last_changelog_id":1842,"applied":true}');

    expect(tokens.filter((token) => token.kind === 'key').map((token) => token.text)).toEqual(['"status"', '"last_changelog_id"', '"applied"']);
    expect(tokens.filter((token) => token.kind === 'string').map((token) => token.text)).toEqual(['"ok"']);
    expect(tokens.map((token) => token.text).join('')).toBe(prettyActivityJson('{"status":"ok","last_changelog_id":1842,"applied":true}'));
  });

  it('leaves strings inside an array plain, as the mockup tokenizer does', () => {
    const tokens = toActivityJsonTokens('{"fields":["episodes"]}');

    expect(tokens.filter((token) => token.kind !== 'plain').map((token) => token.text)).toEqual(['"fields"']);
  });

  it('keeps escaped quotes inside one string value', () => {
    const tokens = toActivityJsonTokens('{"m":"say \\"hi\\""}');

    expect(tokens.find((token) => token.kind === 'string')?.text).toBe('"say \\"hi\\""');
  });

  it('keys every run by where it starts in the shown text', () => {
    const tokens = toActivityJsonTokens('{"a":"b"}');
    const shown = prettyActivityJson('{"a":"b"}');

    expect(tokens.every((token) => shown.startsWith(token.text, token.offset))).toBe(true);
    expect(new Set(tokens.map((token) => token.offset)).size).toBe(tokens.length);
  });

  it('shows plain text that is not JSON as one plain run', () => {
    expect(toActivityJsonTokens('not json')).toEqual([{ kind: 'plain', offset: 0, text: 'not json' }]);
  });

  it('shows nothing for an empty body', () => {
    expect(toActivityJsonTokens('')).toEqual([]);
  });
});
