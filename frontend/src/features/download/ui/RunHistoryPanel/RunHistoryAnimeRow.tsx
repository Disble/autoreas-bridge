import { Skeleton } from '@heroui/react';
import penIcon from '@iconify-icons/solar/pen-linear';
import { useId } from 'react';
import { NoCoverPoster } from '../../../../shared/anime-cover/NoCoverPoster/NoCoverPoster';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { RUN_HISTORY_NAME_LOADING_LABEL, RUN_HISTORY_NO_COVER_LABEL } from './run-history-panel.constants';
import type { RunHistoryAnimeRowProps } from './run-history-panel.types';
import { RunHistoryManualLinks } from './RunHistoryManualLinks';

/**
 * One anime inside an outcome group: its cover, its name (a skeleton while the
 * catalog names an anime the run left unnamed), the value for that
 * outcome (episodes with their site host, reason or on-disk counts, one
 * value per line), "Edit anime" on a skipped
 * anime, and any manual links under it.
 */
export function RunHistoryAnimeRow({ row, cover, onCopy, onEditAnime, onOpenLink }: Readonly<RunHistoryAnimeRowProps>) {
  const { animeId } = row;
  const nameLoadingLabelId = useId();

  return (
    <li className="flex min-w-0 flex-col gap-1 rounded-[.6rem] p-1.5">
      <div className="flex min-w-0 items-center gap-3">
        <span className="block aspect-[230/325] w-8 shrink-0 overflow-hidden rounded-md bg-default">
          {cover?.status === 'cover' ? (
            <img alt="" className="size-full object-cover" decoding="async" src={cover.dataUrl} />
          ) : (
            <NoCoverPoster label={RUN_HISTORY_NO_COVER_LABEL} showLabel={false} />
          )}
        </span>
        {row.isNameLoading === true ? (
          <span aria-labelledby={nameLoadingLabelId} aria-live="polite" className="min-w-0 flex-1" role="status">
            <span className="sr-only" id={nameLoadingLabelId}>
              {RUN_HISTORY_NAME_LOADING_LABEL}
            </span>
            <Skeleton className="h-4 w-40 max-w-full rounded" />
          </span>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[15px] text-foreground">{row.name}</span>
        )}
        <span className="flex shrink-0 flex-col items-end whitespace-nowrap text-sm text-muted tabular-nums">
          {row.values.map((value) => (
            <span key={value}>{value}</span>
          ))}
        </span>
        {row.isEditable && animeId !== undefined ? (
          <IconActionButton ariaLabel={`Edit ${row.name}`} icon={penIcon} tooltip="Edit anime" variant="ghost" onPress={() => onEditAnime(animeId)} />
        ) : null}
      </div>
      <RunHistoryManualLinks links={row.links} onCopy={onCopy} onOpenLink={onOpenLink} />
    </li>
  );
}
