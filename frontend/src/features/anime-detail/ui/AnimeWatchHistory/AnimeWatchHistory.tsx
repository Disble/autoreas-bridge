import { useMemo, useState } from 'react';
import { Accordion, Chip, ProgressBar, Tabs } from '@heroui/react';
import { AnimeWatchEpisodeList } from './AnimeWatchEpisodeList';
import { AnimeWatchSummary } from './AnimeWatchSummary';
import { formatAnimeWatchHistorySubtitle, toAnimeWatchViewModels } from './anime-watch-history.helpers';
import {
  ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_ID,
  ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_LABEL,
  ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID,
  ANIME_WATCH_HISTORY_BY_WATCH_TAB_LABEL,
  ANIME_WATCH_HISTORY_CURRENT_CHIP_LABEL,
  ANIME_WATCH_HISTORY_LABEL,
  ANIME_WATCH_HISTORY_TABS_LABEL,
} from './anime-watch-history.constants';
import type { AnimeWatchHistoryProps } from './anime-watch-history.types';

/**
 * Per-anime Watch history section, the screen's single history section (Real Watch
 * History spec, "History Surfaces Redesign"): a heading with the watch count
 * and the log's start date, and two tabs beside it. "By watch" (default)
 * renders one Accordion card per watch, newest-first with the live watch
 * carrying a Current chip; it and any pre-log watch open by default. Each heading shows the
 * watch status on the left and its date span over its episode count on the
 * right. Expanding an item shows that watch's progress bar and loads its own
 * episode list through a per-watch-gated `AnimeWatchEpisodeList` (collapsed
 * items keep their rows, so re-expanding spends no new binding call). "All
 * episodes" renders the flat newest-first list across every cycle. Switching
 * tabs unmounts the inactive panel (RAC Tabs behavior). The per-watch view
 * models derive from the raw detail DTO the parent drills in, so mutation
 * updates flow through the same freshness as the rest of the screen.
 * Pre-log watches render the dashed AnimeWatchSummary from their repetition
 * record instead of a progress bar and episode rows; post-log past watches
 * with zero rows state the episodes were not recorded.
 */
export function AnimeWatchHistory(props: Readonly<AnimeWatchHistoryProps>) {
  const views = useMemo(() => toAnimeWatchViewModels(props.detail), [props.detail]);
  const displayViews = useMemo(() => [...views].reverse(), [views]);
  // The live watch and every pre-log summary open by default: neither spends
  // a binding call a post-log past watch would (its list fetches on expand).
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(
    () => new Set(views.filter((view) => view.isCurrent || view.isPreLog).map((view) => view.key)),
  );

  return (
    <section aria-label={ANIME_WATCH_HISTORY_LABEL} className="flex flex-col">
      <Tabs className="gap-3" defaultSelectedKey={ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-foreground">{ANIME_WATCH_HISTORY_LABEL}</h3>
            <p className="mt-0.5 text-xs text-muted">{formatAnimeWatchHistorySubtitle(views.length)}</p>
          </div>
          <Tabs.ListContainer className="w-fit">
            <Tabs.List aria-label={ANIME_WATCH_HISTORY_TABS_LABEL}>
              <Tabs.Tab className="h-7 px-3 text-[12.5px] whitespace-nowrap" id={ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID}>
                {ANIME_WATCH_HISTORY_BY_WATCH_TAB_LABEL}
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab className="h-7 px-3 text-[12.5px] whitespace-nowrap" id={ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_ID}>
                {ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_LABEL}
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </div>
        <Tabs.Panel className="p-0" id={ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID}>
          <Accordion.Root
            allowsMultipleExpanded
            className="flex flex-col gap-2.5"
            expandedKeys={expandedKeys}
            hideSeparator
            onExpandedChange={(keys) => {
              setExpandedKeys(new Set([...keys].map((key) => String(key))));
            }}
          >
            {displayViews.map((view) => (
              <Accordion.Item className="rounded-2xl bg-white/[0.03]" id={view.key} key={view.key}>
                <Accordion.Heading>
                  <Accordion.Trigger className="grid grid-cols-[1.375rem_minmax(0,1fr)_auto] items-center gap-3 rounded-2xl px-4 py-3.5">
                    <Accordion.Indicator className="ms-0 data-[expanded=true]:rotate-0" />
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground">Watch {view.number}</span>
                      {view.isCurrent ? (
                        <Chip color="accent" size="sm" variant="soft">
                          <Chip.Label>{ANIME_WATCH_HISTORY_CURRENT_CHIP_LABEL}</Chip.Label>
                        </Chip>
                      ) : null}
                      <Chip color={view.statusColor} size="sm" variant="soft">
                        <Chip.Label>{view.statusLabel}</Chip.Label>
                      </Chip>
                    </span>
                    <span className="flex flex-col items-end text-xs font-normal text-muted">
                      <span>{view.spanLabel}</span>
                      <span className="tabular-nums text-foreground">{view.episodesLabel}</span>
                    </span>
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body className="pb-4 ps-[3.125rem] pe-4">
                    {view.isPreLog && view.summary !== undefined ? (
                      <AnimeWatchSummary summary={view.summary} watchNumber={view.number} />
                    ) : (
                      <div className="flex flex-col gap-2">
                        {view.progressRatio === undefined ? null : (
                          <ProgressBar aria-label={`Watch ${view.number} progress`} size="sm" value={view.progressRatio}>
                            <ProgressBar.Track>
                              <ProgressBar.Fill />
                            </ProgressBar.Track>
                          </ProgressBar>
                        )}
                        <AnimeWatchEpisodeList
                          animeId={props.animeId}
                          cycle={view.number}
                          enabled={expandedKeys.has(view.key)}
                          isPastWatch={!view.isCurrent}
                        />
                      </div>
                    )}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Tabs.Panel>
        <Tabs.Panel className="p-0" id={ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_ID}>
          <AnimeWatchEpisodeList animeId={props.animeId} />
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
