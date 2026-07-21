import { Chip } from '@heroui/react';
import { useSeasonNavBadge } from './use-season-nav-badge';

/**
 * Renders a small "Open" badge next to the Season nav item while a season is
 * currently open, and renders nothing otherwise.
 */
export function SeasonNavBadge() {
  const isSeasonOpen = useSeasonNavBadge();

  if (!isSeasonOpen) {
    return null;
  }

  return (
    <Chip color="accent" size="sm" variant="soft">
      <Chip.Label>Open</Chip.Label>
    </Chip>
  );
}
