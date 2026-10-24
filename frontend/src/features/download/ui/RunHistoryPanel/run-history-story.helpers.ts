import type { DownloadRunView, ManualLink } from '../../../../shared/contracts/download.types';
import {
  RUN_HISTORY_EXPIRED_NOTE,
  RUN_HISTORY_FAILURE_LABELS,
  RUN_HISTORY_GROUPS,
  RUN_HISTORY_SKIP_LABELS,
} from './run-history-panel.constants';
import { toRunStatusPresentation } from './run-history-panel.helpers';
import type {
  RunHistoryAnimeRowViewModel,
  RunHistoryBarViewModel,
  RunHistoryDetailViewModel,
  RunHistoryGroupViewModel,
  RunHistoryPresentation,
  RunHistoryStory,
  RunHistoryStoryNote,
  RunHistoryStoryState,
  RunHistoryStoryStep,
} from './run-history-panel.types';

/** Recorded metadata of one step, parsed. */
type StepFacts = Readonly<Record<string, unknown>>;

/** Everything one run's steps say about one anime, in the order it first appears. */
interface AnimeFacts {
  readonly animeId: string;
  name?: string;
  checked?: { readonly onDisk: number; readonly latest: number };
  readonly downloaded: { readonly episode: number; readonly siteHost?: string }[];
  readonly failures: { readonly episode?: number; readonly kind: string }[];
  skipReason?: string;
  upToDate?: string;
}

/** The anime lines of each group, before counts and headers. */
interface GroupRows {
  readonly failed: RunHistoryAnimeRowViewModel[];
  readonly pending: RunHistoryAnimeRowViewModel[];
  readonly downloaded: RunHistoryAnimeRowViewModel[];
  readonly skipped: RunHistoryAnimeRowViewModel[];
  readonly upToDate: RunHistoryAnimeRowViewModel[];
}

/**
 * Builds the selected run's detail: its status, episodes bar, outcome groups
 * and the note about its stored story. Group counts are the run's own
 * counters; the anime lines come from the run's `download.*` steps grouped by
 * the anime id each step names. Without a stored story every group shows its
 * header only.
 *
 * @param run The selected run.
 * @param storyState Where the run's story stands.
 * @returns The detail view model.
 */
export function toRunHistoryDetailViewModel(run: DownloadRunView, storyState: RunHistoryStoryState): RunHistoryDetailViewModel {
  const isRunning = run.status === 'running';
  const groups = toGroups(run, toRows(run, storyState), isRunning);

  return {
    run,
    status: toRunStatusPresentation(run.status),
    isRunning,
    bar: toBar(run, isRunning),
    groups,
    storyNote: toStoryNote(storyState, groups.length > 0, isRunning),
  };
}

/**
 * Builds the detail of the selected run, or nothing when no run is selected.
 *
 * @param run The selected run, if any.
 * @param storyState Where that run's story stands.
 * @returns The detail view model, or undefined.
 */
export function toSelectedRunDetail(run: DownloadRunView | undefined, storyState: RunHistoryStoryState): RunHistoryDetailViewModel | undefined {
  return run === undefined ? undefined : toRunHistoryDetailViewModel(run, storyState);
}

/**
 * Lists the catalog ids of every anime line in a detail, for the cover cache.
 * Old manual links that never recorded an id are left out.
 *
 * @param detail The selected run's detail, if any.
 * @returns The anime ids, in display order.
 */
export function collectDetailAnimeIds(detail: RunHistoryDetailViewModel | undefined): string[] {
  const rows = (detail?.groups ?? []).flatMap((group) => group.rows ?? []);
  return rows.flatMap((row) => (row.animeId === undefined ? [] : [row.animeId]));
}

/**
 * Formats a set of episode numbers: one episode, one consecutive range, or the
 * ranges joined by commas.
 *
 * @param episodes The episode numbers, in any order.
 * @returns The label, such as `Episode 4` or `Episodes 4–6, 9`.
 */
function formatEpisodes(episodes: readonly number[]): string {
  const sorted = [...new Set(episodes)].sort((left, right) => left - right);
  if (sorted.length === 1) {
    return `Episode ${sorted[0]}`;
  }

  const ranges: string[] = [];
  let start = sorted[0];
  for (let index = 1; index <= sorted.length; index += 1) {
    if (sorted[index] !== sorted[index - 1] + 1) {
      ranges.push(start === sorted[index - 1] ? String(start) : `${start}–${sorted[index - 1]}`);
      start = sorted[index];
    }
  }

  return `Episodes ${ranges.join(', ')}`;
}

/** Reads each group's anime lines: from the stored steps, else from the run's manual links alone. */
function toRows(run: DownloadRunView, storyState: RunHistoryStoryState): Partial<GroupRows> | undefined {
  const manualLinks = run.manualLinks ?? [];
  if (storyState.status === 'ready' && storyState.story.steps.length > 0) {
    return toGroupRows(storyState.story.steps, manualLinks);
  }

  return toLinkOnlyRows(storyState, manualLinks);
}

/** Builds the outcome groups in display order, dropping the ones with neither a count nor a line. */
function toGroups(run: DownloadRunView, rows: Partial<GroupRows> | undefined, isRunning: boolean): RunHistoryGroupViewModel[] {
  const pending = isRunning ? RUN_HISTORY_GROUPS.downloading : RUN_HISTORY_GROUPS.notAttempted;
  return [
    toGroup('failed', RUN_HISTORY_GROUPS.failed, run.episodesFailed, rows?.failed, true, false),
    toGroup('pending', pending, run.episodesDownloading, rows?.pending, true, isRunning),
    toGroup('downloaded', RUN_HISTORY_GROUPS.downloaded, run.episodesDownloaded, rows?.downloaded, true, false),
    toGroup('skipped', RUN_HISTORY_GROUPS.skipped, run.skippedCount, rows?.skipped, true, false),
    toGroup('upToDate', RUN_HISTORY_GROUPS.upToDate, run.upToDateCount, rows?.upToDate, false, false),
  ].filter((group) => group.count > 0 || (group.rows?.length ?? 0) > 0);
}

/** Builds one group's view model. */
function toGroup(
  id: RunHistoryGroupViewModel['id'],
  presentation: RunHistoryPresentation,
  count: number,
  rows: readonly RunHistoryAnimeRowViewModel[] | undefined,
  defaultExpanded: boolean,
  isLive: boolean,
): RunHistoryGroupViewModel {
  return {
    id,
    ...presentation,
    count,
    rows,
    defaultExpanded,
    isLive,
    allLinks: rows?.flatMap((row) => row.links) ?? [],
  };
}

/** Builds the episodes bar, or nothing when the run found no episode. */
function toBar(run: DownloadRunView, isRunning: boolean): RunHistoryBarViewModel | undefined {
  if (run.episodesFound <= 0) {
    return undefined;
  }

  const pendingLabel = isRunning ? 'downloading' : 'not attempted';
  return {
    downloaded: run.episodesDownloaded,
    failed: run.episodesFailed,
    pending: run.episodesDownloading,
    isRunning,
    label: `${run.episodesDownloaded} downloaded, ${run.episodesFailed} failed, ${run.episodesDownloading} ${pendingLabel} of ${run.episodesFound} found`,
  };
}

/** Picks the note beside the totals: a capped story, or a finished run whose steps are gone. */
function toStoryNote(storyState: RunHistoryStoryState, hasGroups: boolean, isRunning: boolean): RunHistoryStoryNote | undefined {
  if (storyState.status !== 'ready') {
    return undefined;
  }

  const { story } = storyState;
  if (story.steps.length === 0) {
    return hasGroups && !isRunning ? { kind: 'expired', label: RUN_HISTORY_EXPIRED_NOTE } : undefined;
  }

  return story.truncated ? { kind: 'truncated', label: truncatedLabel(story) } : undefined;
}

/** The Activity run story's own wording for a capped story. */
function truncatedLabel(story: RunHistoryStory): string {
  return `Showing the first ${story.steps.length} steps of a longer run.`;
}

/** Turns the steps and manual links into each group's anime lines. */
function toGroupRows(steps: readonly RunHistoryStoryStep[], manualLinks: readonly ManualLink[]): GroupRows {
  const anime = collectAnimeFacts(steps);
  const linksByAnime = assignManualLinks(anime, manualLinks);
  const rows: GroupRows = { failed: [], pending: [], downloaded: [], skipped: [], upToDate: [] };

  for (const facts of anime.values()) {
    appendAnimeRows(rows, facts, linksByAnime.get(facts.animeId) ?? []);
  }

  // Links whose anime left no step (stored before the id was recorded, or past
  // the story cap) still belong to the run, so they keep a line of their own.
  rows.pending.push(...toLinkRows(linksByAnime.get('') ?? [], rows.pending.length));

  return rows;
}

/** Adds one anime's lines to every group its steps and manual links put it in. */
function appendAnimeRows(rows: GroupRows, facts: AnimeFacts, links: readonly ManualLink[]): void {
  const name = facts.name ?? links[0]?.anime ?? facts.animeId;
  const line = (group: keyof GroupRows, values: string | readonly string[], extra: Partial<RunHistoryAnimeRowViewModel> = {}) => {
    rows[group].push({ key: `${group}-${facts.animeId}-${rows[group].length}`, animeId: facts.animeId, name, values: typeof values === 'string' ? [values] : values, links: [], isEditable: false, ...extra });
  };

  for (const failure of facts.failures) {
    line('failed', failureValue(failure));
  }

  const pending = [...remainingEpisodes(facts), ...links.map((link) => link.episode)];
  if (pending.length > 0) {
    line('pending', formatEpisodes(pending), { links: links.flatMap((link) => link.links) });
  }

  if (facts.downloaded.length > 0) {
    line('downloaded', siteHostLines(facts.downloaded));
  }

  if (facts.skipReason !== undefined) {
    line('skipped', RUN_HISTORY_SKIP_LABELS[facts.skipReason] ?? facts.skipReason, { isEditable: true });
  }

  if (facts.upToDate !== undefined) {
    line('upToDate', facts.upToDate);
  }
}

/** Words one failure: `Episode 7 · Captcha`, or the label alone when the failure names no episode. */
function failureValue(failure: AnimeFacts['failures'][number]): string {
  const label = RUN_HISTORY_FAILURE_LABELS[failure.kind] ?? failure.kind;
  return failure.episode === undefined ? label : `Episode ${failure.episode} · ${label}`;
}

/**
 * Without stored steps, the run's own manual links are all that names an
 * anime: they stay listed under Not attempted, every other group keeps its
 * header only. Nothing is listed while the story is still loading.
 */
function toLinkOnlyRows(storyState: RunHistoryStoryState, manualLinks: readonly ManualLink[]): Partial<GroupRows> | undefined {
  return storyState.status === 'loading' || manualLinks.length === 0 ? undefined : { pending: toLinkRows(manualLinks, 0) };
}

/** One Not attempted line per manual link, keyed after the lines already in the group. */
function toLinkRows(manualLinks: readonly ManualLink[], offset: number): RunHistoryAnimeRowViewModel[] {
  return manualLinks.map((link, index) => ({
    key: `pending-link-${offset + index}`,
    animeId: link.animeId,
    name: link.anime,
    values: [formatEpisodes([link.episode])],
    links: link.links,
    isEditable: false,
  }));
}

/**
 * Words the downloaded episodes of one anime, one line per run of consecutive
 * episodes served by the same site host: `Episodes 9–10 · jkanime.bz`, then
 * `Episode 11 · jkanime.net`. An episode whose event carried no site host
 * gets a line without one.
 *
 * @param downloads The episodes and the site host each came from.
 * @returns The lines, in episode order.
 */
function siteHostLines(downloads: readonly { readonly episode: number; readonly siteHost?: string }[]): string[] {
  const segments: { siteHost?: string; episodes: number[] }[] = [];
  for (const download of [...downloads].sort((left, right) => left.episode - right.episode)) {
    const last = segments.at(-1);
    if (last !== undefined && last.siteHost === download.siteHost && last.episodes.at(-1) === download.episode - 1) {
      last.episodes.push(download.episode);
    } else {
      segments.push({ siteHost: download.siteHost, episodes: [download.episode] });
    }
  }

  return segments.map((segment) => (segment.siteHost === undefined ? formatEpisodes(segment.episodes) : `${formatEpisodes(segment.episodes)} · ${segment.siteHost}`));
}

/** The checked episodes this anime neither downloaded nor failed. */
function remainingEpisodes(facts: AnimeFacts): number[] {
  if (facts.checked === undefined) {
    return [];
  }

  const touched = new Set([...facts.downloaded.map((download) => download.episode), ...facts.failures.flatMap((failure) => (failure.episode === undefined ? [] : [failure.episode]))]);
  const remaining: number[] = [];
  for (let episode = facts.checked.onDisk + 1; episode <= facts.checked.latest; episode += 1) {
    if (!touched.has(episode)) {
      remaining.push(episode);
    }
  }

  return remaining;
}

/**
 * Files each manual link under its anime: by the id it recorded, else by the
 * anime name for links stored before the id existed. Links that match no
 * anime are filed under the empty key.
 */
function assignManualLinks(anime: ReadonlyMap<string, AnimeFacts>, manualLinks: readonly ManualLink[]): Map<string, ManualLink[]> {
  const byAnime = new Map<string, ManualLink[]>();
  for (const link of manualLinks) {
    const owner = link.animeId !== undefined && anime.has(link.animeId)
      ? link.animeId
      : [...anime.values()].find((facts) => facts.name === link.anime)?.animeId ?? '';
    byAnime.set(owner, [...(byAnime.get(owner) ?? []), link]);
  }

  return byAnime;
}

/** Reads every step that names an anime into one record per anime. */
function collectAnimeFacts(steps: readonly RunHistoryStoryStep[]): Map<string, AnimeFacts> {
  const anime = new Map<string, AnimeFacts>();
  for (const step of steps) {
    if (step.entityId === undefined || step.entityId === '') {
      continue;
    }

    const facts = anime.get(step.entityId) ?? { animeId: step.entityId, downloaded: [], failures: [] };
    anime.set(step.entityId, facts);
    const metadata = parseFacts(step.metadataJson);
    facts.name = facts.name ?? readString(metadata, 'animeName');
    applyStep(facts, step, metadata);
  }

  return anime;
}

/** Records what one step says about its anime. */
function applyStep(facts: AnimeFacts, step: RunHistoryStoryStep, metadata: StepFacts): void {
  switch (step.eventType) {
    case 'download.episode_downloaded':
      recordDownload(facts, metadata);
      return;
    case 'download.failed':
      // Warn-level failures are per-hoster retries; only the error-level one is the outcome.
      if (step.level === 'error') {
        facts.failures.push({ episode: readNumber(metadata, 'episode'), kind: readString(metadata, 'failureKind') ?? '' });
      }
      return;
    case 'download.anime_checked':
      facts.checked = { onDisk: readCount(metadata, 'onDiskCount'), latest: readCount(metadata, 'latestOnline') };
      return;
    case 'download.skipped':
      facts.skipReason = readString(metadata, 'reason') ?? '';
      return;
    case 'download.up_to_date':
      facts.upToDate = upToDateValue(metadata);
      return;
    default:
  }
}

/** Records a downloaded episode with the site host that served it; a step without an episode says nothing. */
function recordDownload(facts: AnimeFacts, metadata: StepFacts): void {
  const episode = readNumber(metadata, 'episode');
  if (episode !== undefined) {
    facts.downloaded.push({ episode, siteHost: readString(metadata, 'siteHost') });
  }
}

/** Words an up-to-date anime from its reason and raw counts. */
function upToDateValue(metadata: StepFacts): string {
  const onDisk = readCount(metadata, 'onDiskCount');
  if (readString(metadata, 'reason') === 'season_complete_on_disk') {
    return `${onDisk}/${readCount(metadata, 'totalcap')} · season complete`;
  }

  return `${onDisk} on disk · ${readCount(metadata, 'latestOnline')} online`;
}

/** Reads a count fact; a missing one counts as zero. */
function readCount(metadata: StepFacts, key: string): number {
  return readNumber(metadata, key) ?? 0;
}

/** Parses a step's metadata JSON; anything unreadable is no metadata. */
function parseFacts(metadataJson: string): StepFacts {
  try {
    const parsed: unknown = JSON.parse(metadataJson);
    return typeof parsed === 'object' && parsed !== null ? (parsed as StepFacts) : {};
  } catch {
    return {};
  }
}

/** Reads a string fact. */
function readString(metadata: StepFacts, key: string): string | undefined {
  const value = metadata[key];
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Reads a numeric fact. */
function readNumber(metadata: StepFacts, key: string): number | undefined {
  const value = metadata[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
