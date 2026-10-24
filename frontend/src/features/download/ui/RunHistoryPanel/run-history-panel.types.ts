import type { IconifyIcon } from '@iconify/react';
import type { ReactNode, RefObject, UIEvent } from 'react';
import type { AnimeCoverSource } from '../../../../shared/anime-cover/anime-cover.types';
import type { AnimeCoverEntry } from '../../../../shared/anime-cover/use-anime-cover';
import type { DownloadRunView } from '../../../../shared/contracts/download.types';

/** One step of a run story, as `GetActivityRunStory` returns it; only the fields the breakdown reads. */
export interface RunHistoryStoryStep {
  /** The anime the step is about; absent on run-level steps. */
  readonly entityId?: string;
  /** Event type, such as `download.episode_downloaded`. */
  readonly eventType: string;
  /** Logger level: `debug`, `info`, `warn` or `error`. */
  readonly level: string;
  /** Raw metadata JSON; empty when none was recorded. */
  readonly metadataJson: string;
}

/** The stored steps of one run, oldest first. */
export interface RunHistoryStory {
  /** The run's steps. */
  readonly steps: readonly RunHistoryStoryStep[];
  /** True when the backend capped the steps. */
  readonly truncated: boolean;
}

/** The run-story read the detail pane needs; the Activity source satisfies it. */
export interface RunHistoryStorySource {
  /** Reads the stored steps of one run by its id. */
  readonly getRunStory: (runId: string) => Promise<RunHistoryStory>;
}

/** Where the selected run's story stands. */
export type RunHistoryStoryState =
  | { readonly status: 'loading' }
  | { readonly status: 'error' }
  | { readonly status: 'ready'; readonly story: RunHistoryStory };

/** The reads the panel needs beyond the download source, injectable for tests. */
export interface RunHistoryPanelPorts {
  /** Reads a run's stored steps; without it the detail shows the group counts only. */
  readonly storySource?: RunHistoryStorySource;
  /** Resolves anime covers. */
  readonly coverSource?: AnimeCoverSource;
}

/** Props for the `RunHistoryPanel` dumb-UI component. */
export interface RunHistoryPanelProps {
  readonly className?: string;
  /** Reads a run's stored steps for the per-anime breakdown. */
  readonly storySource?: RunHistoryStorySource;
}

/** Loading/empty/error/ready states for the run history list (2026 quality bar). */
export type RunHistoryPanelStatus = 'loading' | 'empty' | 'error' | 'ready';

/** Semantic tone of an icon or bar segment; `default` stays muted. */
export type RunHistoryTone = 'default' | 'accent' | 'success' | 'warning' | 'danger';

/** A fixed label with its icon and tone, for a status, trigger or group. */
export interface RunHistoryPresentation {
  readonly label: string;
  readonly icon: IconifyIcon;
  readonly tone: RunHistoryTone;
}

/** A single row rendered in the master list, with its labels pre-computed. */
export interface RunHistoryRowViewModel {
  readonly runId: string;
  readonly isSelected: boolean;
  /** The raw trigger value, shown as the tile's tooltip. */
  readonly trigger: string;
  /** The trigger's fixed label and icon; an unknown trigger shows its raw value. */
  readonly triggerPresentation: RunHistoryPresentation;
  /** Local start time. */
  readonly timeLabel: string;
  /** Run duration; absent while running and on an interrupted run. */
  readonly durationLabel?: string;
  /** Local day the run started, for the day headers. */
  readonly dayKey: string;
  readonly dayLabel: string;
  readonly episodesFound: number;
  readonly episodesDownloaded: number;
  readonly episodesFailed: number;
  /** Status icon; absent for an `ok` run. */
  readonly status?: RunHistoryPresentation;
}

/** Consecutive rows that started on the same local day. */
export interface RunHistoryDayGroupViewModel {
  readonly key: string;
  readonly label: string;
  readonly rows: readonly RunHistoryRowViewModel[];
}

/** One anime line inside an outcome group. */
export interface RunHistoryAnimeRowViewModel {
  readonly key: string;
  /** Catalog id; absent for an old manual link that never recorded it. */
  readonly animeId?: string;
  readonly name: string;
  /** Episodes, reason or on-disk counts, from fixed maps and raw values; one entry per line. */
  readonly values: readonly string[];
  /** Manual-download links offered for this anime. */
  readonly links: readonly string[];
  /** True when the row offers "Edit anime". */
  readonly isEditable: boolean;
}

/** Identifies an outcome group of the detail. */
export type RunHistoryGroupId = 'failed' | 'pending' | 'downloaded' | 'skipped' | 'upToDate';

/** One outcome group of the selected run: its header and, when the story is stored, its anime. */
export interface RunHistoryGroupViewModel extends RunHistoryPresentation {
  readonly id: RunHistoryGroupId;
  /** The run's own counter for this outcome. */
  readonly count: number;
  /** The anime lines; undefined when the story is not available, which shows the header only. */
  readonly rows?: readonly RunHistoryAnimeRowViewModel[];
  /** Whether the group starts expanded. */
  readonly defaultExpanded: boolean;
  /** True for the live run's group, whose icon turns. */
  readonly isLive: boolean;
  /** True when a finished run counts episodes here but its story recorded no line for them. */
  readonly isUnrecorded: boolean;
  /** Every link of the group, for "Copy all links"; empty when there are none. */
  readonly allLinks: readonly string[];
}

/** The episodes bar of a run that found any. */
export interface RunHistoryBarViewModel {
  readonly downloaded: number;
  readonly failed: number;
  readonly pending: number;
  readonly isRunning: boolean;
  /** Accessible summary of the segments. */
  readonly label: string;
}

/** The note beside the totals about the stored story. */
export interface RunHistoryStoryNote {
  readonly kind: 'expired' | 'truncated';
  readonly label: string;
}

/** Everything the detail pane renders for the selected run. */
export interface RunHistoryDetailViewModel {
  readonly run: DownloadRunView;
  /** Status icon and label; absent for an `ok` run. */
  readonly status?: RunHistoryPresentation;
  readonly isRunning: boolean;
  readonly bar?: RunHistoryBarViewModel;
  readonly groups: readonly RunHistoryGroupViewModel[];
  readonly storyNote?: RunHistoryStoryNote;
}

/** Aggregate view model returned by `useRunHistoryPanel`. */
export interface RunHistoryPanelViewModel {
  readonly status: RunHistoryPanelStatus;
  readonly rows: readonly RunHistoryRowViewModel[];
  readonly visibleRows: readonly RunHistoryRowViewModel[];
  /** The visible rows under their day headers. */
  readonly visibleDays: readonly RunHistoryDayGroupViewModel[];
  readonly canLoadMore: boolean;
  readonly remainingCount: number;
  /** Runs whose status is a problem, counted over the whole history. */
  readonly problemCount: number;
  /** True while the list shows only the problem runs. */
  readonly problemsOnly: boolean;
  /** True while a run is still open, which is what reveals the Stop control. */
  readonly runInProgress: boolean;
  /** Id of the run still open, used to scope a pending stop to that exact run. */
  readonly runningRunId?: string;
  /**
   * True from the moment a stop is requested until that run reaches a terminal
   * status. Stopping is not instant — the backend cancels the run's context and the
   * pipeline stops at its next boundary — so the control must stay visibly busy
   * rather than looking inert.
   */
  readonly isStopping: boolean;
  readonly selectedRun?: DownloadRunView;
  /** The selected run's detail; undefined when nothing is selected. */
  readonly detail?: RunHistoryDetailViewModel;
  /** Cover per anime id of the detail's rows. */
  readonly covers: ReadonlyMap<string, AnimeCoverEntry>;
  readonly errorMessage?: string;
}

/** Props for the `RunHistoryCard` frame: the titled card with its header tools beside the title. */
export interface RunHistoryCardProps {
  readonly className?: string;
  /** Card-level controls shown in the header, beside the title; omitted while nothing is loaded. */
  readonly tools?: ReactNode;
  /** The panel body: a state (loading, empty, error) or the master/detail view. */
  readonly children: ReactNode;
}

/** Props for the `RunHistoryHeaderTools` dumb-UI component. */
export interface RunHistoryHeaderToolsProps {
  readonly runInProgress: boolean;
  readonly isStopping: boolean;
  readonly onCancel: () => void;
  /** Problems filter; hidden when the count is zero. */
  readonly problemCount: number;
  readonly problemsOnly: boolean;
  readonly onToggleProblems: () => void;
}

/** Props for the `RunHistoryProblemsFilter` dumb-UI component. */
export interface RunHistoryProblemsFilterProps {
  readonly count: number;
  readonly isOn: boolean;
  readonly onToggle: () => void;
}

/** Props for the `RunHistoryMasterList` dumb-UI component. */
export interface RunHistoryMasterListProps {
  readonly days: readonly RunHistoryDayGroupViewModel[];
  readonly scrollRef: RefObject<HTMLDivElement | null>;
  readonly onScroll: (event: UIEvent<HTMLDivElement>) => void;
  readonly onSelectRun: (runId: string) => void;
}

/** Props for the `RunHistoryRunRow` dumb-UI component. */
export interface RunHistoryRunRowProps {
  readonly row: RunHistoryRowViewModel;
  readonly onSelectRun: (runId: string) => void;
}

/** Props for the `RunHistoryRunCount` dumb-UI component. */
export interface RunHistoryRunCountProps {
  readonly count: number;
  readonly icon: IconifyIcon;
  /** Outcome color of the icon only. */
  readonly iconClassName: string;
  /** What the count is, such as `downloaded`. */
  readonly label: string;
}

/** Props for the `RunHistoryStatusIcon` dumb-UI component. */
export interface RunHistoryStatusIconProps {
  readonly status: RunHistoryPresentation;
}

/** The detail pane's actions. */
export interface RunHistoryDetailActions {
  /** Copies text and confirms it with the given message. */
  readonly onCopy: (text: string, confirmation: string) => void;
  /** Opens the anime in the editor. */
  readonly onEditAnime: (animeId: string) => void;
  /** Opens a manual link in the default browser. */
  readonly onOpenLink: (url: string) => void;
}

/** Props for the `RunHistoryDetailPane` dumb-UI component. */
export interface RunHistoryDetailPaneProps extends RunHistoryDetailActions {
  /** Undefined renders the "select a run" prompt in place of the detail. */
  readonly detail: RunHistoryDetailViewModel | undefined;
  readonly covers: ReadonlyMap<string, AnimeCoverEntry>;
}

/** Props for the `RunHistoryOutcomeGroup` dumb-UI component. */
export interface RunHistoryOutcomeGroupProps extends RunHistoryDetailActions {
  readonly group: RunHistoryGroupViewModel;
  readonly covers: ReadonlyMap<string, AnimeCoverEntry>;
}

/** Props for the `RunHistoryAnimeRow` dumb-UI component. */
export interface RunHistoryAnimeRowProps extends RunHistoryDetailActions {
  readonly row: RunHistoryAnimeRowViewModel;
  /** The anime's cover; undefined renders the no-cover poster. */
  readonly cover: AnimeCoverEntry | undefined;
}

/** Props for the `RunHistoryManualLinks` dumb-UI component. */
export interface RunHistoryManualLinksProps {
  readonly links: readonly string[];
  readonly onCopy: (text: string, confirmation: string) => void;
  /** Opens one link in the default browser. */
  readonly onOpenLink: (url: string) => void;
}

/** Props for the `RunProgressBar` episode-segments visualisation. */
export interface RunProgressBarProps {
  readonly bar: RunHistoryBarViewModel;
}

/** Props for the `RunHistoryErrorAlert` dumb-UI component. */
export interface RunHistoryErrorAlertProps {
  /** The message, shown verbatim. */
  readonly message: string;
}
