import checkCircleIcon from '@iconify-icons/solar/check-circle-bold-duotone';
import inboxIcon from '@iconify-icons/solar/inbox-bold-duotone';
import magniferIcon from '@iconify-icons/solar/magnifer-bold-duotone';
import { describe, expect, it } from 'vitest';
import { getAirisEmptyStateActionVariant, getAirisEmptyStateIcon, resolveAirisEmptyStateKind } from '../airis-empty-state.helpers';

describe('resolveAirisEmptyStateKind', () => {
  it('reads an omitted kind as first-run and keeps an explicit one', () => {
    expect(resolveAirisEmptyStateKind({ description: 'd', imageSrc: '/a.webp', title: 't' })).toBe('first-run');
    expect(resolveAirisEmptyStateKind({ description: 'd', kind: 'filtered', title: 't' })).toBe('filtered');
  });
});

describe('getAirisEmptyStateIcon', () => {
  it.each([
    { kind: 'filtered' as const, icon: magniferIcon },
    { kind: 'caught-up' as const, icon: checkCircleIcon },
    { kind: 'first-run' as const, icon: inboxIcon },
    { kind: 'waiting-on-step' as const, icon: inboxIcon },
  ])('gives $kind its own icon', ({ kind, icon }) => {
    expect(getAirisEmptyStateIcon(kind)).toBe(icon);
  });
});

describe('getAirisEmptyStateActionVariant', () => {
  it.each([
    { kind: 'filtered' as const, variant: 'secondary' },
    { kind: 'caught-up' as const, variant: 'primary' },
    { kind: 'first-run' as const, variant: 'primary' },
    { kind: 'waiting-on-step' as const, variant: 'primary' },
  ])('makes the $kind action $variant', ({ kind, variant }) => {
    expect(getAirisEmptyStateActionVariant(kind)).toBe(variant);
  });
});
