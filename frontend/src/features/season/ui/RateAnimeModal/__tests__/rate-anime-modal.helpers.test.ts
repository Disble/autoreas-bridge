import { describe, expect, it } from 'vitest';

import { formatGradeLabel, getGradeSourceNote } from '../rate-anime-modal.helpers';

describe('getGradeSourceNote', () => {
  it('describes a mobile-synced grade', () => {
    expect(getGradeSourceNote('mobile_sync')).toBe('Synced from mobile');
  });

  it('describes a manually-set grade', () => {
    expect(getGradeSourceNote('manual')).toBe('Set on desktop');
  });

  it('returns an empty note when ungraded', () => {
    expect(getGradeSourceNote('')).toBe('');
  });
});

describe('formatGradeLabel', () => {
  it('renders a numeric grade', () => {
    expect(formatGradeLabel(4)).toBe('4');
  });

  it('renders "No grade" when ungraded', () => {
    expect(formatGradeLabel(0)).toBe('No grade');
  });
});
