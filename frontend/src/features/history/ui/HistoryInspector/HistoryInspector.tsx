import { Alert, Button, Chip, Link, ProgressBar, Skeleton } from "@heroui/react";
import { getAnimeEstadoLabel } from "../../../../shared/helpers/anime-estado.helpers";
import { getAnimeTipoLabel } from "../../../../shared/helpers/anime-tipo.helpers";
import { AnimeCoverPlaceholder } from "../../../../shared/ui/AnimeCoverPlaceholder";
import { formatRowDateTime } from "../../../../shared/watch-history/watch-history.helpers";
import { getHistoryStatusColor } from "../HistoryTimeline/history-timeline.helpers";
import {
  HISTORY_INSPECTOR_ADDED_LABEL,
  HISTORY_INSPECTOR_COVER_ALT,
  HISTORY_INSPECTOR_ERROR_TITLE,
  HISTORY_INSPECTOR_LAST_WATCHED_LABEL,
  HISTORY_INSPECTOR_LOADING_LABEL,
  HISTORY_INSPECTOR_OPEN_LABEL,
  HISTORY_INSPECTOR_PROGRESS_LABEL,
  HISTORY_INSPECTOR_PROMPT_TITLE,
  HISTORY_INSPECTOR_RECENT_TITLE,
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
 * Renders exactly one of four exclusive states: a compact prompt when no row
 * is selected (not `AirisEmptyState`: nothing was requested), a
 * shape-mirroring skeleton while the detail is unresolved, the surface error
 * `Alert` when it failed, or the content. Content and placeholder never
 * render together: the content branch is gated on the resolved `detail`,
 * never on the collection alone.
 */
export function HistoryInspector({ animeId, onOpenAnime }: HistoryInspectorProps) {
  const { addedMs, cover, detail, lastWatchedMs, recentEpisodes, status } = useHistoryInspector({ animeId });

  if (status === "prompt") {
    return <p className="text-sm text-muted">{HISTORY_INSPECTOR_PROMPT_TITLE}</p>;
  }

  if (status === "loading") {
    return (
      <div aria-labelledby="history-inspector-loading-label" aria-live="polite" className="flex flex-col gap-3" role="status">
        <span className="sr-only" id="history-inspector-loading-label">{HISTORY_INSPECTOR_LOADING_LABEL}</span>
        <div className="flex items-center gap-3">
          <Skeleton className="size-16 rounded" />
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
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {cover.status === "cover" ? (
          <img alt={HISTORY_INSPECTOR_COVER_ALT} className="size-16 rounded object-cover" src={cover.dataUrl} />
        ) : (
          <AnimeCoverPlaceholder className="size-16" />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <Link onPress={() => onOpenAnime(detail.id)}>{detail.name}</Link>
          <span className="flex flex-wrap gap-1">
            <Chip color={getHistoryStatusColor(detail.status)} size="sm" variant="soft">{getAnimeEstadoLabel(detail.status)}</Chip>
            <Chip color="default" size="sm" variant="soft">{getAnimeTipoLabel(detail.kind)}</Chip>
          </span>
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted">{detail.episodesWatched} episodes</p>
        {progressRatio === undefined ? null : (
          <ProgressBar aria-label={HISTORY_INSPECTOR_PROGRESS_LABEL} value={progressRatio}>
            <ProgressBar.Track>
              <ProgressBar.Fill />
            </ProgressBar.Track>
          </ProgressBar>
        )}
      </div>
      {lastWatchedMs === undefined ? null : (
        <p className="text-sm"><span className="text-muted">{HISTORY_INSPECTOR_LAST_WATCHED_LABEL}: </span>{formatHistoryInspectorLastWatched(lastWatchedMs)}</p>
      )}
      {addedMs === undefined ? null : (
        <p className="text-sm"><span className="text-muted">{HISTORY_INSPECTOR_ADDED_LABEL}: </span>{formatHistoryInspectorAdded(addedMs)}</p>
      )}
      {recentEpisodes.length === 0 ? null : (
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted">{HISTORY_INSPECTOR_RECENT_TITLE}</p>
          <ul className="flex flex-col gap-1">
            {recentEpisodes.map((row) => (
              <li className="flex items-baseline justify-between gap-2 text-sm" key={row.id}>
                <span>Episode {row.episode}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted">{formatRowDateTime(row.watchedAtMs)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <Button onPress={() => onOpenAnime(detail.id)}>{HISTORY_INSPECTOR_OPEN_LABEL}</Button>
    </div>
  );
}
