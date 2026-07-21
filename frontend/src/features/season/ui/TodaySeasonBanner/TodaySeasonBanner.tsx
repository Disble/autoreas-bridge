import { Icon } from '@iconify/react';
import arrowIcon from '@iconify-icons/solar/arrow-right-bold-duotone';
import { Link } from 'react-router';
import { useTodaySeasonBanner } from './use-today-season-banner';

/**
 * Slim banner shown on the Today page while a season is open, linking to
 * the Season page.
 */
export function TodaySeasonBanner() {
  const isSeasonOpen = useTodaySeasonBanner();

  if (!isSeasonOpen) {
    return null;
  }

  return (
    <Link
      className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 text-sm text-primary hover:bg-primary/15"
      to="/season"
    >
      <span>A season is currently open</span>
      <Icon aria-hidden="true" className="size-4" icon={arrowIcon} />
    </Link>
  );
}
