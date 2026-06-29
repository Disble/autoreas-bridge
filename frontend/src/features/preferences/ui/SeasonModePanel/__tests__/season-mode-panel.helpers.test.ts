import { describe, expect, it } from 'vitest';
import { getSeasonModeLabel } from '../season-mode-panel.helpers';

describe('getSeasonModeLabel', () => {
  it('returns "Desactivado" when season mode is false', () => {
    expect(getSeasonModeLabel(false)).toBe('Desactivado');
  });

  it('returns "Activado" when season mode is true', () => {
    expect(getSeasonModeLabel(true)).toBe('Activado');
  });
});
