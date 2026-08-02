import { describe, expect, it } from 'vitest';
import { isAutoStartSaved } from '../auto-start-panel.helpers';

describe('isAutoStartSaved', () => {
  it('accepts only the successful binding status', () => {
    expect(isAutoStartSaved('ok')).toBe(true);
    expect(isAutoStartSaved('registry unavailable')).toBe(false);
  });
});
