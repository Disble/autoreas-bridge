import { describe, expect, it } from 'vitest';
import { DRAWER_PRESENCE_CLOSED } from '../drawer.constants';
import type { DrawerPresence } from '../drawer.types';
import { isDrawerSlideOutEnd, nextDrawerPresence, settleDrawerPresence } from '../drawer-presence.helpers';
import { feedLine } from './drawer.fixtures';

/** The first line of the feed. */
const A = feedLine({}, { id: 'a' });
/** The second line of the feed. */
const B = feedLine({}, { id: 'b' });

/** A presence with the given fields. */
function presence(overrides: Partial<DrawerPresence>): DrawerPresence {
  return { ...DRAWER_PRESENCE_CLOSED, ...overrides };
}

describe('nextDrawerPresence', () => {
  it('moving to another line keeps the session', () => {
    expect(nextDrawerPresence(presence({ line: A, open: true, session: 1 }), B)).toEqual({ line: B, open: true, session: 1 });
  });

  it.each([
    ['the same open line', presence({ line: A, open: true, session: 1 }), A],
    ['a closed drawer staying closed', presence({ line: A, open: false, session: 1 }), undefined],
  ])('returns the held presence itself for %s', (_name, held, line) => {
    expect(nextDrawerPresence(held, line)).toBe(held);
  });
});

describe('settleDrawerPresence', () => {
  it('drops the held line once a closed drawer has slid out', () => {
    expect(settleDrawerPresence(presence({ line: A, open: false, session: 3 }))).toEqual({ line: undefined, open: false, session: 3 });
  });

  it('keeps an open drawer', () => {
    const held = presence({ line: A, open: true, session: 3 });

    expect(settleDrawerPresence(held)).toBe(held);
  });
});

describe('isDrawerSlideOutEnd', () => {
  /** The panel element. */
  const panel = {};

  it('ignores a child transition', () => {
    expect(isDrawerSlideOutEnd({ propertyName: 'translate', target: {}, currentTarget: panel })).toBe(false);
  });
});
