import { Button, Typography, cn } from '@heroui/react';
import { SOLO_ANIME_DOWNLOAD_ROW_CLASS } from './solo-anime-download-panel.constants';
import type { SoloAnimeDownloadResultRailProps } from './solo-anime-download-panel.types';

/**
 * Renders the readiness rail's body: the empty-state message when the
 * current tab has no matches, or the scrollable row list when it does.
 * Neither renders while `status` is "loading" — the skeleton in
 * `SoloAnimeDownloadStatusBanner` covers that state instead.
 *
 * Gated on the request as well as on having options: a reload keeps the
 * previous readiness list in state, and without this the real rows render
 * beneath the placeholders instead of being replaced by them.
 */
export function SoloAnimeDownloadResultRail({
  status,
  options,
  selectedId,
  emptyMessage,
  listWindow,
  onSelectAnime,
}: Readonly<SoloAnimeDownloadResultRailProps>) {
  if (status === 'loading') {
    return null;
  }

  if (options.length === 0) {
    return (
      <Typography color="muted" type="body-sm">
        {emptyMessage}
      </Typography>
    );
  }

  return (
    <div
      className="h-[22rem] min-h-0 overflow-x-hidden overflow-y-auto"
      data-testid="solo-anime-download-scroll"
      onScroll={listWindow.onScroll}
      ref={listWindow.scrollRef}
    >
      <div className="flex flex-col gap-0.5">
        {options.map((option) => (
          <Button
            className={cn(
              SOLO_ANIME_DOWNLOAD_ROW_CLASS,
              selectedId === option.id ? 'border-accent bg-accent/10' : 'border-transparent bg-transparent hover:bg-white/[0.04]',
              option.ready ? '' : 'opacity-60',
            )}
            key={option.id}
            variant="tertiary"
            onPress={() => onSelectAnime(option.id)}
          >
            <Typography className="min-w-0 flex-1 whitespace-normal break-words text-left" type="body-sm" weight="semibold">
              {option.name}
            </Typography>
            <span className="w-32 shrink-0 text-right">
              {option.statusTag === undefined ? null : (
                <Typography className="text-warning" truncate type="body-xs">
                  {option.statusTag}
                </Typography>
              )}
            </span>
          </Button>
        ))}
      </div>
    </div>
  );
}
