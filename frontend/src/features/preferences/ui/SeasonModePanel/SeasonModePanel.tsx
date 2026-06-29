import { Skeleton, Switch } from '@heroui/react';
import type { SeasonModePanelProps } from './season-mode-panel.types';
import { SEASON_MODE_HELPER_TEXT } from './season-mode-panel.constants';
import { useSeasonModePanel } from './use-season-mode-panel';

/**
 * SeasonModePanel renders a toggle for the season mode preference. All Wails
 * calls and state logic live in the colocated `useSeasonModePanel` hook; this
 * component is presentation-only.
 */
export function SeasonModePanel({ className }: Readonly<SeasonModePanelProps>) {
  const { seasonMode, isLoading, label, errorMessage, toggle } = useSeasonModePanel();

  if (isLoading) {
    return (
      <section aria-label="Loading preferences" className={className}>
        <Skeleton className="h-10 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section className={className}>
      {errorMessage !== undefined && (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      )}

      <Switch isSelected={seasonMode} onChange={() => void toggle()}>
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          {label}
        </Switch.Content>
      </Switch>

      <p className="mt-2 text-sm text-muted">{SEASON_MODE_HELPER_TEXT}</p>
    </section>
  );
}
