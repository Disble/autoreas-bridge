import { Chip, ProgressBar, Typography } from '@heroui/react';
import { ANIME_DETAIL_PROGRESS_LABEL, ANIME_DETAIL_TITLE_ID } from './anime-detail.constants';
import type { AnimeDetailSectionProps } from './anime-detail.types';

/**
 * The identity block: the anime name as the page `h1`; the type, estado and
 * Active/Inactive chips on one line; then one progress line (episode count on
 * the left, duration on the right) over a bar that renders only with a total.
 */
export function AnimeDetailIdentity({ detail }: Readonly<AnimeDetailSectionProps>) {
  return (
    <header className="flex min-w-0 flex-col gap-2">
      <Typography className="[overflow-wrap:anywhere]" id={ANIME_DETAIL_TITLE_ID} type="h1">{detail.nombre}</Typography>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm whitespace-nowrap text-muted">{detail.tipoLabel}</span>
        <Chip color={detail.estadoColor} size="sm" variant="soft">
          <Chip.Label>{detail.estadoLabel}</Chip.Label>
        </Chip>
        <Chip color={detail.statusColor} size="sm" variant="soft">
          <Chip.Label>{detail.statusLabel}</Chip.Label>
        </Chip>
      </div>
      <section aria-label="Episode info" className="flex flex-col gap-1 pt-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-sm">
          <span className="text-lg font-bold text-foreground tabular-nums">{detail.progressCountLabel}</span>
          <span className="text-muted tabular-nums @max-[419px]:w-full">{detail.durationLabel}</span>
        </div>
        {detail.progressRatio === undefined ? null : (
          <ProgressBar aria-label={ANIME_DETAIL_PROGRESS_LABEL} size="sm" value={detail.progressRatio}>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        )}
      </section>
    </header>
  );
}
