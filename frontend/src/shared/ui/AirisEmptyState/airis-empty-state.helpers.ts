import type { IconifyIcon } from '@iconify/react';
import checkCircleIcon from '@iconify-icons/solar/check-circle-bold-duotone';
import inboxIcon from '@iconify-icons/solar/inbox-bold-duotone';
import magniferIcon from '@iconify-icons/solar/magnifer-bold-duotone';
import type { AirisEmptyStateKind, AirisEmptyStateProps } from './airis-empty-state.types';

/**
 * Resolves the kind a caller meant: an omitted kind is `first-run`, the only
 * kind that existed before kinds did.
 *
 * @param props The empty state's props.
 * @returns The effective kind.
 */
export function resolveAirisEmptyStateKind(props: AirisEmptyStateProps): AirisEmptyStateKind {
  return props.kind ?? 'first-run';
}

/**
 * The icon a kind shows wherever the mascot does not: always in a `row`, and
 * for `filtered` and `caught-up` everywhere. A search glyph says "your criteria
 * did this", a check says "done", and an inbox stands for a place that is
 * simply empty.
 *
 * @param kind The effective kind.
 * @returns The Iconify icon for that kind.
 */
export function getAirisEmptyStateIcon(kind: AirisEmptyStateKind): IconifyIcon {
  if (kind === 'filtered') return magniferIcon;
  if (kind === 'caught-up') return checkCircleIcon;
  return inboxIcon;
}

/**
 * The weight of the recovery action: clearing filters undoes something the user
 * did, so it is secondary; every other kind's action is the next step and is
 * primary.
 *
 * @param kind The effective kind.
 * @returns The HeroUI button variant.
 */
export function getAirisEmptyStateActionVariant(kind: AirisEmptyStateKind): 'primary' | 'secondary' {
  return kind === 'filtered' ? 'secondary' : 'primary';
}
