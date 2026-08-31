import { describe, expect, it } from 'vitest';
import { readVerdict } from '../layout-smoke.mjs';

/**
 * The browser does the measuring; this parser is the only logic in
 * `layout-smoke.mjs` that can be wrong on its own, so it is the part worth
 * testing. Everything else it does -- build, serve, spawn Edge -- is the check
 * itself.
 */
describe('readVerdict', () => {
  it('reads the verdict and the report the fixture wrote', () => {
    const dom = '<pre data-layout-verdict="pass">ok   the surface stays put — 460px</pre>';

    expect(readVerdict(dom)).toStrictEqual({ verdict: 'pass', report: 'ok   the surface stays put — 460px' });
  });

  it('carries a failing verdict through with the lines behind it', () => {
    const dom = '<pre data-layout-verdict="fail">FAIL a long title wraps — 1 line(s)</pre>';

    expect(readVerdict(dom).verdict).toBe('fail');
    expect(readVerdict(dom).report).toContain('1 line(s)');
  });

  // A page that never measured is not a page that passed. `pending` reaching
  // the caller as its own verdict is what stops this gate from reading "not yet"
  // as "fine" -- which is how a gate quietly stops guarding.
  it('reports a page that never measured as pending, not as a pass', () => {
    expect(readVerdict('<pre data-layout-verdict="pending"></pre>').verdict).toBe('pending');
  });

  // The fixture failing to mount at all produces no verdict node whatsoever.
  it('reports a missing verdict rather than inventing one', () => {
    const result = readVerdict('<html><body><div id="root"></div></body></html>');

    expect(result.verdict).toBe('missing');
    expect(result.report).toContain('no verdict');
  });

  // `--dump-dom` escapes text content, so a report read back raw would show
  // entities where the fixture wrote punctuation.
  it('resolves the entities dump-dom escapes', () => {
    const dom = '<pre data-layout-verdict="fail">rows &lt; 70% &amp; title &gt; 1 line</pre>';

    expect(readVerdict(dom).report).toBe('rows < 70% & title > 1 line');
  });
});

/**
 * The page grew a second fixture (the Activity detail card), so the parser has
 * to speak for every fixture on it. Reading only the first one would let a
 * broken second fixture ship behind a green gate -- the exact failure this
 * harness exists to prevent.
 */
describe('readVerdict across several fixtures', () => {
  it('passes only when every fixture on the page passed', () => {
    const dom = '<pre data-layout-verdict="pass">ok   the toast stays put</pre><pre data-layout-verdict="pass">ok   the card stays put</pre>';

    expect(readVerdict(dom)).toStrictEqual({ verdict: 'pass', report: 'ok   the toast stays put\nok   the card stays put' });
  });

  it('fails the whole page when a later fixture fails', () => {
    const dom = '<pre data-layout-verdict="pass">ok   the toast stays put</pre><pre data-layout-verdict="fail">FAIL the card widens the page</pre>';

    expect(readVerdict(dom).verdict).toBe('fail');
    expect(readVerdict(dom).report).toContain('the card widens the page');
  });

  // A fixture that never measured is the state a broken fixture leaves behind,
  // and it must not be rescued by a sibling that did measure.
  it('reports a fixture that never measured even when its sibling passed', () => {
    const dom = '<pre data-layout-verdict="pass">ok   the toast stays put</pre><pre data-layout-verdict="pending"></pre>';

    expect(readVerdict(dom).verdict).toBe('pending');
  });
});
