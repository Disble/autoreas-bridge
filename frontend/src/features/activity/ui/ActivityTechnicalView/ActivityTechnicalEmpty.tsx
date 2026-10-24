import { Icon } from '@iconify/react';
import clockIcon from '@iconify-icons/solar/clock-circle-linear';
import type { ActivityTechnicalEmptyProps } from './activity-technical-view.types';

/**
 * The empty state of a technical tab as the mockup draws it (`.ax-tech-empty`):
 * centred, a 28px clock, the title in the foreground and the reason muted.
 */
export function ActivityTechnicalEmpty({ title, description }: ActivityTechnicalEmptyProps) {
  return (
    <div className="grid place-items-center gap-2 px-4 py-10 text-center text-sm text-muted">
      <Icon aria-hidden className="size-7" icon={clockIcon} />
      <b className="font-medium text-foreground">{title}</b>
      <span>{description}</span>
    </div>
  );
}
