import { Alert, Button, Chip, Link, ProgressBar, Skeleton } from "@heroui/react";
import historyAirisArtwork from "../../../../assets/airis-empty-states/today.webp";
import { getAnimeEstadoLabel } from "../../../../shared/helpers/anime-estado.helpers";
import { getAnimeTipoLabel } from "../../../../shared/helpers/anime-tipo.helpers";
import { AirisEmptyState } from "../../../../shared/ui/AirisEmptyState/AirisEmptyState";
import { AnimeCoverPlaceholder } from "../../../../shared/ui/AnimeCoverPlaceholder";
import { formatEpisodeCount, formatRowShortDateTime } from "../../../../shared/watch-history/watch-history.helpers";
import { getHistoryStatusColor } from "../HistoryTimeline/history-timeline.helpers";
import {
  HISTORY_INSPECTOR_ADDED_LABEL,
  HISTORY_INSPECTOR_COVER_ALT,
  HISTORY_INSPECTOR_ERROR_TITLE,
  HISTORY_INSPECTOR_LAST_WATCHED_LABEL,
  HISTORY_INSPECTOR_LOADING_LABEL,
  HISTORY_INSPECTOR_OPEN_LABEL,
  HISTORY_INSPECTOR_PROGRESS_LABEL,
  HISTORY_INSPECTOR_PROMPT_DESCRIPTION,
  HISTORY_INSPECTOR_PROMPT_TITLE,
  HISTORY_INSPECTOR_RECENT_TITLE,
  HISTORY_INSPECTOR_WATCHED_LABEL,
} from "./history-inspector.constants";
import {
  deriveHistoryInspectorProgressRatio,
  formatHistoryInspectorAdded,
  formatHistoryInspectorLastWatched,
} from "./history-inspector.helpers";
import type { HistoryInspectorProps } from "./history-inspector.types";
import { useHistoryInspector } from "./use-history-inspector";

/**
 * Inspector for the selected History row (Anime History spec, "Selecting A
 * Row Fills The Inspector Without Navigating"; design D8): the linked name
 * and the "Open anime detail" button are the two ways into Anime Detail.
 * Owns its data via `useHistoryInspector`, keyed by the URL `animeId`.
 *
 * Renders exactly one of four exclusive states: the Airis empty state when
 * no row is selected (autoreas-theme: an empty surface shows artwork, never a
 * bare sentence), a
 * shape-mirroring skeleton while the detail is unresolved, the surface error
 * `Alert` when it failed, or the content. Content and placeholder never
 * render together: the content branch is gated on the resolved `detail`,
 * never on the collection alone.
 */
export function HistoryInspector({ animeId, onOpenAnime }: HistoryInspectorProps) {
  const { addedMs, cover, detail, lastWatchedMs, recentEpisodes, status } = useHistoryInspector({ animeId });

  if (status === "prompt") {
    return (
      <div className="flex flex-1 flex-col justify-center">
        <AirisEmptyState description={HISTORY_INSPECTOR_PROMPT_DESCRIPTION} imageSrc={historyAirisArtwork} title={HISTORY_INSPECTOR_PROMPT_TITLE} />
      </div>
    );
  }

  if (status === "loading") {
    return (
      <div aria-labelledby="history-inspector-loading-label" aria-live="polite" className="flex flex-col gap-3" role="status">
        <span className="sr-only" id="history-inspector-loading-label">{HISTORY_INSPECTOR_LOADING_LABEL}</span>
        <div className="flex items-center gap-3">
          <Skeleton className="size-14 shrink-0 rounded-full" />
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <Skeleton className="h-4 w-32 rounded" />
            <Skeleton className="h-3 w-20 rounded" />
          </span>
        </div>
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
      </div>
    );
  }

  if (status === "error" || detail === undefined) {
    return (
      <Alert status="danger">
        <Alert.Content>
          <Alert.Title>{HISTORY_INSPECTOR_ERROR_TITLE}</Alert.Title>
        </Alert.Content>
      </Alert>
    );
  }

  const progressRatio = deriveHistoryInspectorProgressRatio(detail);

  return (
    <div className="flex flex-1 flex-col gap-3 text-[13px]">
      <div className="flex items-center gap-3">
        {cover.status === "cover" ? (
          <img alt={HISTORY_INSPECTOR_COVER_ALT} className="size-14 shrink-0 rounded-full object-cover" src={cover.dataUrl} />
        ) : (
          <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-default text-muted">
            <AnimeCoverPlaceholder className="size-10" />
          </span>
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1.5">
          <Link
            className="w-fit text-sm font-semibold text-foreground underline decoration-foreground/35 underline-offset-[3px]"
            onPress={() => onOpenAnime(detail.id)}
          >
            {detail.name}
          </Link>
          <span className="flex flex-wrap gap-1.5">
            <Chip color={getHistoryStatusColor(detail.status)} size="sm" variant="soft">{getAnimeEstadoLabel(detail.status)}</Chip>
            <Chip color="default" size="sm" variant="soft">{getAnimeTipoLabel(detail.kind)}</Chip>
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="flex justify-between gap-3 text-xs">
          <span className="text-muted">{HISTORY_INSPECTOR_WATCHED_LABEL}</span>
          <span className="tabular-nums text-foreground">{formatEpisodeCount(detail.episodesWatched)}</span>
        </p>
        {progressRatio === undefined ? null : (
          <ProgressBar aria-label={HISTORY_INSPECTOR_PROGRESS_LABEL} maxValue={1} size="sm" value={progressRatio}>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        )}
      </div>
      {lastWatchedMs === undefined && addedMs === undefined ? null : (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
          {lastWatchedMs === undefined ? null : (
            <>
              <dt className="text-muted">{HISTORY_INSPECTOR_LAST_WATCHED_LABEL}</dt>
              <dd className="text-foreground">{formatHistoryInspectorLastWatched(lastWatchedMs)}</dd>
            </>
          )}
          {addedMs === undefined ? null : (
            <>
              <dt className="text-muted">{HISTORY_INSPECTOR_ADDED_LABEL}</dt>
              <dd className="text-foreground">{formatHistoryInspectorAdded(addedMs)}</dd>
            </>
          )}
        </dl>
      )}
      {recentEpisodes.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <p className="mt-1 text-[11.5px] font-semibold tracking-wide text-muted uppercase">{HISTORY_INSPECTOR_RECENT_TITLE}</p>
          <ul className="flex flex-col gap-1">
            {recentEpisodes.map((row) => (
              <li className="flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2" key={row.id}>
                <span className="text-foreground">Episode {row.episode}</span>
                <span className="shrink-0 tabular-nums text-muted">{formatRowShortDateTime(row.watchedAtMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button className="mt-auto self-start" size="sm" onPress={() => onOpenAnime(detail.id)}>{HISTORY_INSPECTOR_OPEN_LABEL}</Button>
    </div>
  );
}
