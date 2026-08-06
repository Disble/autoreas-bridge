import { Skeleton, Switch } from '@heroui/react';
import { useEpisodeRenamePanel } from './use-episode-rename-panel';
import type { EpisodeRenamePanelProps } from './episode-rename-panel.types';

/**
 * EpisodeRenamePanel renders the episode auto-rename opt-in. All state and Wails
 * I/O live in the colocated `useEpisodeRenamePanel` hook; this component is
 * presentation-only.
 */
export function EpisodeRenamePanel({ className }: Readonly<EpisodeRenamePanelProps>) {
  const { status, enabled, isSaving, errorMessage, setEnabled } = useEpisodeRenamePanel();

  if (status === 'loading') {
    return (
      <section aria-label="Loading episode rename setting" className={className}>
        <Skeleton className="h-10 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section className={`flex flex-col gap-3 ${className ?? ''}`}>
      {errorMessage !== undefined && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      )}

      <Switch
        isDisabled={isSaving}
        isSelected={enabled}
        onChange={(isSelected) => {
          setEnabled(isSelected).catch(() => undefined);
        }}
      >
        <Switch.Content>
          <Switch.Control>
            <Switch.Thumb />
          </Switch.Control>
          Rename downloaded episodes
        </Switch.Content>
      </Switch>

      <p className="text-sm text-muted">
        Hosters name files things like <code>qk2rlwv6tci3.mp4</code>. When this is on, each episode is renamed as it
        lands, using the anime name and its episode number — for example <code>NegaPosi Angler - 04.mp4</code>.
      </p>
      <p className="text-sm text-muted">
        Only newly downloaded episodes are renamed; files already on disk are left exactly as they are.
      </p>
    </section>
  );
}
