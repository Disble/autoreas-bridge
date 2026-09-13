import { useMemo, useState } from 'react';
import { Accordion, Chip, ProgressBar, Tabs } from '@heroui/react';
import { AnimeWatchEpisodeList } from './AnimeWatchEpisodeList';
import { AnimeWatchSummary } from './AnimeWatchSummary';
import { toAnimeWatchViewModels } from './anime-watch-history.helpers';
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
 * History spec, "History Surfaces Redesign"): two tabs sharing one section
 * heading. "By watch" (default) renders one Accordion item per watch,
 * newest-first with the live watch carrying a Current chip; each heading shows
 * the watch status, its date span, the episode count, and a progress bar, and
 * expanding an item loads that cycle's own episode list through a
 * per-watch-gated `AnimeWatchEpisodeList` (collapsed items keep their rows,
 * so re-expanding spends no new binding call). "All episodes" renders the
 * flat newest-first list across every cycle. Switching tabs unmounts the
 * inactive panel (RAC Tabs behavior), collapsing it back to idle. The
 * per-watch view models derive from the raw detail DTO the parent drills in,
 * so mutation updates flow through the same freshness as the rest of the
 * screen. Pre-log watches render the dashed AnimeWatchSummary from their
 * repetition record instead of episode rows; post-log past watches with zero
 * rows state the episodes were not recorded.
 */
export function AnimeWatchHistory(props: Readonly<AnimeWatchHistoryProps>) {
  const views = useMemo(() => toAnimeWatchViewModels(props.detail), [props.detail]);
  const displayViews = useMemo(() => [...views].reverse(), [views]);
  const [expandedKeys, setExpandedKeys] = useState<ReadonlySet<string>>(new Set());

  return (
    <section aria-label={ANIME_WATCH_HISTORY_LABEL} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{ANIME_WATCH_HISTORY_LABEL}</h3>

      <Tabs defaultSelectedKey={ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID}>
        <Tabs.ListContainer>
          <Tabs.List aria-label={ANIME_WATCH_HISTORY_TABS_LABEL}>
            <Tabs.Tab id={ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID}>
              {ANIME_WATCH_HISTORY_BY_WATCH_TAB_LABEL}
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id={ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_ID}>
              {ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_LABEL}
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel id={ANIME_WATCH_HISTORY_BY_WATCH_TAB_ID}>
          <Accordion.Root
            allowsMultipleExpanded
            expandedKeys={expandedKeys}
            onExpandedChange={(keys) => {
              setExpandedKeys(new Set([...keys].map((key) => String(key))));
            }}
          >
            {displayViews.map((view) => (
              <Accordion.Item id={view.key} key={view.key}>
                <Accordion.Heading>
                  <Accordion.Trigger>
                    <span className="text-foreground">Watch {view.number}</span>
                    {view.isCurrent ? (
                      <Chip color="default" size="sm" variant="soft">
                        <Chip.Label>{ANIME_WATCH_HISTORY_CURRENT_CHIP_LABEL}</Chip.Label>
                      </Chip>
                    ) : null}
                    <Chip color={view.statusColor} size="sm" variant="soft">
                      <Chip.Label>{view.statusLabel}</Chip.Label>
                    </Chip>
                    <span className="text-xs text-muted">{view.spanLabel}</span>
                    <span className="text-xs text-muted">{view.episodesLabel}</span>
                    {view.progressRatio === undefined ? null : (
                      <ProgressBar aria-label={`Watch ${view.number} progress`} value={view.progressRatio}>
                        <ProgressBar.Track>
                          <ProgressBar.Fill />
                        </ProgressBar.Track>
                      </ProgressBar>
                    )}
                  </Accordion.Trigger>
                </Accordion.Heading>
                <Accordion.Panel>
                  <Accordion.Body>
                    {view.isPreLog && view.summary !== undefined ? (
                      <AnimeWatchSummary summary={view.summary} watchNumber={view.number} />
                    ) : (
                      <AnimeWatchEpisodeList
                        animeId={props.animeId}
                        cycle={view.number}
                        enabled={expandedKeys.has(view.key)}
                        isPastWatch={!view.isCurrent}
                      />
                    )}
                  </Accordion.Body>
                </Accordion.Panel>
              </Accordion.Item>
            ))}
          </Accordion.Root>
        </Tabs.Panel>
        <Tabs.Panel id={ANIME_WATCH_HISTORY_ALL_EPISODES_TAB_ID}>
          <AnimeWatchEpisodeList animeId={props.animeId} />
        </Tabs.Panel>
      </Tabs>
    </section>
  );
}
