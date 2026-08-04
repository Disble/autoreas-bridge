import { describe, expect, it } from 'vitest';
import { isNearListBottom, nextRenderLimit } from '../progressive-list.helpers';

describe('progressive list helpers', () => {
  it('detects a scroll position inside the load threshold', () => {
    expect(isNearListBottom(4760, 500, 5460)).toBe(true);
    expect(isNearListBottom(4720, 500, 5460)).toBe(true); // exactly on the 240px threshold
    expect(isNearListBottom(0, 500, 5460)).toBe(false);
  });

  it('treats a list shorter than its viewport as already at the bottom', () => {
    expect(isNearListBottom(0, 0, 0)).toBe(true);
  });

  it('honours a caller-supplied threshold', () => {
    expect(isNearListBottom(0, 500, 600, 100)).toBe(true);
    expect(isNearListBottom(0, 500, 700, 100)).toBe(false);
  });

  it('grows the render limit by one batch', () => {
    expect(nextRenderLimit(20, 20, 842)).toBe(40);
  });

  it('never overshoots the item count', () => {
    expect(nextRenderLimit(840, 20, 842)).toBe(842);
    expect(nextRenderLimit(842, 20, 842)).toBe(842);
  });
});
