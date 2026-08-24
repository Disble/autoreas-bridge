import { describe, expect, it } from 'vitest';
import { resolveToastTimeoutMs } from '../app-toast-queue';
import { SEVERITY_TO_VARIANT } from '../notification-resolver.constants';

/**
 * Characterization spike for design.md §3 Decision F's "bounded unknown".
 *
 * Verified directly against the installed `@heroui/react` 3.2.4 dist source
 * (`components/toast/toast-queue.js`): the exported `ToastQueue` class --
 * the one both the module-level `toast.*` singleton AND this app's own
 * `appToastQueue` are built from -- resolves an *omitted* `timeout` to its
 * own `DEFAULT_TOAST_TIMEOUT` (4000ms) before ever reaching the underlying
 * react-aria-components queue. There is no code path through this class
 * where omitting `timeout` produces a persistent toast; only an explicit `0`
 * does. This test pins that verified behavior so the queue swap
 * (`app-notification.helpers.tsx`) cannot regress it into an assumption.
 */
describe('resolveToastTimeoutMs', () => {
  it('resolves a persistent notification to an explicit 0 -- never an omitted timeout', () => {
    expect(resolveToastTimeoutMs(true)).toBe(0);
  });

  it('resolves a non-persistent (or unset) notification to the literal 4000ms timeout', () => {
    expect(resolveToastTimeoutMs(false)).toBe(4000);
    expect(resolveToastTimeoutMs(undefined)).toBe(4000);
  });
});

/** Pins all four severity -> HeroUI toast variant mappings as literals. */
describe('SEVERITY_TO_VARIANT', () => {
  it('maps success to the success variant', () => {
    expect(SEVERITY_TO_VARIANT.success).toBe('success');
  });

  it('maps warning to the warning variant', () => {
    expect(SEVERITY_TO_VARIANT.warning).toBe('warning');
  });

  it('maps error to the danger variant', () => {
    expect(SEVERITY_TO_VARIANT.error).toBe('danger');
  });

  it('maps info to the accent variant', () => {
    expect(SEVERITY_TO_VARIANT.info).toBe('accent');
  });
});
