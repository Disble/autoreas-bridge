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
  it.each([
    ['opening starts a new session', DRAWER_PRESENCE_CLOSED, A, { line: A, open: true, session: 1 }],
    ['moving to another line keeps the session', presence({ line: A, open: true, session: 1 }), B, { line: B, open: true, session: 1 }],
    ['closing holds the last line while it slides out', presence({ line: A, open: true, session: 1 }), undefined, { line: A, open: false, session: 1 }],
    ['reopening while it slides out starts a new session', presence({ line: A, open: false, session: 1 }), B, { line: B, open: true, session: 2 }],
  ])('%s', (_name, held, line, expected) => {
    expect(nextDrawerPresence(held, line)).toEqual(expected);
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

  it.each([
    ['the panel slide', 'translate', panel, true],
    ['the width change', 'width', panel, false],
    ['a child transition', 'translate', {}, false],
  ])('%s', (_name, propertyName, target, expected) => {
    expect(isDrawerSlideOutEnd({ propertyName, target, currentTarget: panel })).toBe(expected);
  });
});
