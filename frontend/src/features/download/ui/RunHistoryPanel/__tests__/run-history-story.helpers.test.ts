import { describe, expect, it } from 'vitest';
import type { DownloadRunView } from '../../../../../shared/contracts/download.types';
import { toRunHistoryDetailViewModel } from '../run-history-story.helpers';
import type { RunHistoryGroupId, RunHistoryStoryState, RunHistoryStoryStep } from '../run-history-panel.types';

/** Builds a finished run whose counters the cases override. */
function createRun(overrides: Partial<DownloadRunView> = {}): DownloadRunView {
  return {
    runId: 'run-1',
    startedAtMs: 1_000,
    finishedAtMs: 61_000,
    trigger: 'scheduled',
    animesChecked: 2,
    episodesFound: 4,
    episodesDownloaded: 2,
    episodesFailed: 1,
    episodesDownloading: 1,
    skippedCount: 1,
    upToDateCount: 1,
    jdAvailable: true,
    status: 'partial',
    ...overrides,
  };
}

/** Builds one stored step about an anime. */
function step(entityId: string | undefined, eventType: string, metadata: Record<string, unknown>, level = 'info'): RunHistoryStoryStep {
  return { entityId, eventType, level, metadataJson: JSON.stringify(metadata) };
}

/** Wraps steps in a loaded story. */
function ready(steps: readonly RunHistoryStoryStep[], truncated = false): RunHistoryStoryState {
  return { status: 'ready', story: { steps, truncated } };
}

/** Reads one group's rows as `name: value` lines. */
function lines(state: RunHistoryStoryState, run: DownloadRunView, id: RunHistoryGroupId): string[] | undefined {
  const group = toRunHistoryDetailViewModel(run, state).groups.find((candidate) => candidate.id === id);
  return group?.rows?.map((row) => `${row.name}: ${row.values.join(' | ')}`);
}

describe('toRunHistoryDetailViewModel per-anime rows', () => {
  it('groups interleaved steps by the anime they are about', () => {
    const story = ready([
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 4 }),
      step('a2', 'download.episode_downloaded', { animeName: 'Dandadan', episode: 9 }),
      step(undefined, 'download.run_progress', {}),
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 5 }),
    ]);

    expect(lines(story, createRun(), 'downloaded')).toEqual(['Frieren: Episodes 4–5', 'Dandadan: Episode 9']);
  });

  it('lists only error-level failures, with the episode and the failure label', () => {
    const story = ready([
      step('a1', 'download.failed', { animeName: 'Frieren', episode: 7, failureKind: 'hoster_down' }, 'warn'),
      step('a1', 'download.failed', { animeName: 'Frieren', episode: 7, failureKind: 'captcha' }, 'error'),
      step('a2', 'download.failed', { animeName: 'Dandadan', failureKind: 'configuration' }, 'error'),
      step('a3', 'download.failed', { animeName: 'Bocchi', episode: 2, failureKind: 'new_kind' }, 'error'),
    ]);

    expect(lines(story, createRun(), 'failed')).toEqual(['Frieren: Episode 7 · Captcha', 'Dandadan: Configuration', 'Bocchi: Episode 2 · new_kind']);
  });

  it('lists the checked episodes nobody downloaded or failed as not attempted', () => {
    const story = ready([
      step('a1', 'download.anime_checked', { animeName: 'Frieren', onDiskCount: 3, latestOnline: 7, missingEpisodes: 4 }),
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 4 }),
      step('a1', 'download.failed', { animeName: 'Frieren', episode: 5, failureKind: 'captcha' }, 'error'),
      step('a2', 'download.anime_checked', { animeName: 'Dandadan', onDiskCount: 2, latestOnline: 3, missingEpisodes: 1 }),
      step('a2', 'download.episode_downloaded', { animeName: 'Dandadan', episode: 3 }),
    ]);

    expect(lines(story, createRun(), 'pending')).toEqual(['Frieren: Episodes 6–7']);
  });

  it('calls the remaining episodes of a live run Downloading, with a turning icon', () => {
    const story = ready([step('a1', 'download.anime_checked', { animeName: 'Frieren', onDiskCount: 0, latestOnline: 2 })]);
    const pending = toRunHistoryDetailViewModel(createRun({ status: 'running', finishedAtMs: undefined }), story).groups.find((group) => group.id === 'pending');

    expect(pending).toMatchObject({ label: 'Downloading', isLive: true, tone: 'accent' });
    expect(pending?.rows?.map((row) => row.values)).toEqual([['Episodes 1–2']]);
    const finished = toRunHistoryDetailViewModel(createRun(), story).groups.find((group) => group.id === 'pending');
    expect(finished).toMatchObject({ label: 'Not attempted', isLive: false, tone: 'default' });
  });

  it.each([
    [[4], 'Episode 4'],
    [[4, 5, 6], 'Episodes 4–6'],
    [[6, 4, 5], 'Episodes 4–6'],
    [[2, 5], 'Episode 2 | Episode 5'],
    [[1, 2, 5], 'Episodes 1–2 | Episode 5'],
  ])('labels downloaded episodes %j as "%s"', (episodes, label) => {
    const story = ready(episodes.map((episode) => step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode })));

    expect(lines(story, createRun(), 'downloaded')).toEqual([`Frieren: ${label}`]);
  });

  it('gives each run of consecutive episodes from one site host its own line, and omits an unknown site host', () => {
    const story = ready([
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 10, siteHost: 'jkanime.bz' }),
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 9, siteHost: 'jkanime.bz' }),
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 11, siteHost: 'jkanime.net' }),
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 12 }),
      step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 14, siteHost: 'jkanime.net' }),
    ]);

    expect(lines(story, createRun(), 'downloaded')).toEqual(['Frieren: Episodes 9–10 · jkanime.bz | Episode 11 · jkanime.net | Episode 12 | Episode 14 · jkanime.net']);
  });

  it('attaches manual links to their anime by id, then by name for old links', () => {
    const run = createRun({
      status: 'jd_offline',
      manualLinks: [
        { animeId: 'a1', anime: 'Renamed', episode: 4, links: ['https://x/a', 'https://x/b'] },
        { anime: 'Dandadan', episode: 9, links: ['https://x/c'] },
      ],
    });
    const story = ready([
      step('a1', 'download.anime_checked', { animeName: 'Frieren', onDiskCount: 3, latestOnline: 4 }),
      step('a2', 'download.anime_checked', { animeName: 'Dandadan', onDiskCount: 8, latestOnline: 9 }),
    ]);
    const pending = toRunHistoryDetailViewModel(run, story).groups.find((group) => group.id === 'pending');

    expect(pending?.rows?.map((row) => [row.name, row.animeId, row.links])).toEqual([
      ['Frieren', 'a1', ['https://x/a', 'https://x/b']],
      ['Dandadan', 'a2', ['https://x/c']],
    ]);
    expect(pending?.allLinks).toEqual(['https://x/a', 'https://x/b', 'https://x/c']);
  });

  it('names an anime from its manual link when no step carries the name, and keeps a link with no checked anime', () => {
    const run = createRun({ manualLinks: [{ animeId: 'a1', anime: 'Frieren', episode: 4, links: ['https://x/a'] }, { anime: 'Bocchi', episode: 2, links: ['https://x/b'] }] });
    const story = ready([step('a1', 'download.anime_checked', { onDiskCount: 3, latestOnline: 4 })]);

    expect(lines(story, run, 'pending')).toEqual(['Frieren: Episode 4', 'Bocchi: Episode 2']);
  });

  it('words skipped and up-to-date anime from fixed labels and raw counts', () => {
    const story = ready([
      step('a1', 'download.skipped', { animeName: 'Frieren', reason: 'missing_carpeta' }),
      step('a2', 'download.skipped', { animeName: 'Bocchi', reason: 'other_reason' }),
      step('a3', 'download.up_to_date', { animeName: 'Dandadan', reason: 'no_new_episode', onDiskCount: 5, latestOnline: 5 }),
      step('a4', 'download.up_to_date', { animeName: 'Blue Lock', reason: 'season_complete_on_disk', onDiskCount: 12, totalcap: 12 }),
    ]);
    const run = createRun({ skippedCount: 2, upToDateCount: 2 });
    const skipped = toRunHistoryDetailViewModel(run, story).groups.find((group) => group.id === 'skipped');

    expect(lines(story, run, 'skipped')).toEqual(['Frieren: Missing folder', 'Bocchi: other_reason']);
    expect(skipped?.rows?.every((row) => row.isEditable)).toBe(true);
    expect(lines(story, run, 'upToDate')).toEqual(['Dandadan: 5 on disk · 5 online', 'Blue Lock: 12/12 · season complete']);
  });
});

describe('toRunHistoryDetailViewModel groups and notes', () => {
  it('orders the groups, counts them from the run totals and drops the empty ones', () => {
    const detail = toRunHistoryDetailViewModel(createRun({ episodesFailed: 0, skippedCount: 0 }), ready([]));

    expect(detail.groups.map((group) => [group.id, group.count])).toEqual([
      ['pending', 1],
      ['downloaded', 2],
      ['upToDate', 1],
    ]);
    expect(detail.groups.find((group) => group.id === 'upToDate')?.defaultExpanded).toBe(false);
  });

  it('shows the group counts with no rows and the retention note when the story kept no steps', () => {
    const detail = toRunHistoryDetailViewModel(createRun(), ready([]));

    expect(detail.groups.every((group) => group.rows === undefined)).toBe(true);
    expect(detail.storyNote).toEqual({ kind: 'expired', label: 'Per-anime detail is kept for 90 days' });
  });

  it.each<[string, RunHistoryStoryState]>([
    ['kept no steps', ready([])],
    ['could not be read', { status: 'error' }],
  ])('still lists the run manual links under Not attempted when the story %s', (_case, state) => {
    const run = createRun({ manualLinks: [{ animeId: 'a1', anime: 'Frieren', episode: 4, links: ['https://x/a'] }] });
    const detail = toRunHistoryDetailViewModel(run, state);

    expect(lines(state, run, 'pending')).toEqual(['Frieren: Episode 4']);
    expect(detail.groups.find((group) => group.id === 'pending')?.allLinks).toEqual(['https://x/a']);
    expect(detail.groups.filter((group) => group.id !== 'pending').every((group) => group.rows === undefined)).toBe(true);
  });

  // A run stored before per-anime events (no anime_checked) has its pending count but no lines for it.
  it('marks a finished run group with a count but no recorded line as unrecorded, keeping the others', () => {
    const steps = [step('a1', 'download.episode_downloaded', { episode: 3, animeName: 'Frieren' })];
    const detail = toRunHistoryDetailViewModel(createRun({ episodesFailed: 0, skippedCount: 0, upToDateCount: 0 }), ready(steps));

    expect(detail.groups.map((group) => [group.id, group.isUnrecorded, group.rows?.length])).toEqual([
      ['pending', true, 0],
      ['downloaded', false, 1],
    ]);
  });

  it('shows a live run group whose lines have not arrived yet as a header, not as unrecorded', () => {
    const steps = [step('a1', 'download.episode_downloaded', { episode: 3, animeName: 'Frieren' })];
    const run = createRun({ status: 'running', finishedAtMs: undefined, episodesFailed: 0, skippedCount: 0, upToDateCount: 0 });
    const pending = toRunHistoryDetailViewModel(run, ready(steps)).groups.find((group) => group.id === 'pending');

    expect([pending?.isUnrecorded, pending?.rows]).toEqual([false, undefined]);
  });

  it('shows no retention note while the story loads, when it failed, or for a run that found nothing', () => {
    expect(toRunHistoryDetailViewModel(createRun(), { status: 'loading' }).storyNote).toBeUndefined();
    const withLinks = createRun({ manualLinks: [{ anime: 'Frieren', episode: 4, links: ['https://x/a'] }] });
    expect(toRunHistoryDetailViewModel(withLinks, { status: 'loading' }).groups.every((group) => group.rows === undefined)).toBe(true);
    expect(toRunHistoryDetailViewModel(createRun(), { status: 'error' }).groups.every((group) => group.rows === undefined)).toBe(true);
    expect(toRunHistoryDetailViewModel(createRun(), { status: 'error' }).storyNote).toBeUndefined();
    const empty = createRun({ animesChecked: 0, episodesFound: 0, episodesDownloaded: 0, episodesFailed: 0, episodesDownloading: 0, skippedCount: 0, upToDateCount: 0, status: 'no_animes_today' });
    expect(toRunHistoryDetailViewModel(empty, ready([])).storyNote).toBeUndefined();
  });

  it('flags a truncated story with the Activity wording', () => {
    const detail = toRunHistoryDetailViewModel(createRun(), ready([step('a1', 'download.episode_downloaded', { animeName: 'Frieren', episode: 4 }), step('a1', 'download.skipped', {})], true));

    expect(detail.storyNote).toEqual({ kind: 'truncated', label: 'Showing the first 2 steps of a longer run.' });
  });

  it('draws the bar only when episodes were found, naming the pending segment by run state', () => {
    expect(toRunHistoryDetailViewModel(createRun({ episodesFound: 0 }), ready([])).bar).toBeUndefined();
    expect(toRunHistoryDetailViewModel(createRun(), ready([])).bar).toEqual({
      downloaded: 2,
      failed: 1,
      pending: 1,
      isRunning: false,
      label: '2 downloaded, 1 failed, 1 not attempted of 4 found',
    });
    expect(toRunHistoryDetailViewModel(createRun({ status: 'running' }), ready([])).bar?.label).toBe('2 downloaded, 1 failed, 1 downloading of 4 found');
  });

  it('carries the status icon, and none for an ok run', () => {
    expect(toRunHistoryDetailViewModel(createRun(), ready([])).status?.label).toBe('Partial');
    expect(toRunHistoryDetailViewModel(createRun({ status: 'ok' }), ready([])).status).toBeUndefined();
    expect(toRunHistoryDetailViewModel(createRun({ status: 'weird' }), ready([])).status).toMatchObject({ label: 'weird', tone: 'default' });
  });
});
