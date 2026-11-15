import { describe, expect, it } from "vitest";
import type { AnimeDetail, WatchHistoryEntry } from "../../../../../shared/contracts/anime.types";
import {
  deriveHistoryInspectorAddedMs,
  deriveHistoryInspectorLastWatchedMs,
  deriveHistoryInspectorProgressRatio,
  formatHistoryInspectorAdded,
  formatHistoryInspectorLastWatched,
  toHistoryInspectorState,
  toInspectedData,
} from "../history-inspector.helpers";
import type { HistoryInspectorRead } from "../history-inspector.types";

/** Builds the smallest detail fixture the inspector derivations read. */
function detail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    id: "anime-1",
    name: "Frieren",
    status: 0,
    episodesWatched: 8,
    totalEpisodes: 28,
    active: 1,
    genres: [],
    firstCycle: 1,
    days: [],
    modified_at: 0,
    ...overrides,
  };
}

/** Builds a minimal watch-history row carrying only its watch time. */
function row(watchedAtMs: number): WatchHistoryEntry {
  return {
    id: watchedAtMs,
    animeId: "anime-1",
    animeName: "Frieren",
    episode: 1,
    cycle: 1,
    watchedAtMs,
    source: "desktop",
  };
}

describe("deriveHistoryInspectorAddedMs", () => {
  it.each([
    [
      "prefers the first repetition's creation over the reset detail creation",
      detail({
        createdAt: new Date(2026, 7, 29, 12, 0, 0).getTime(),
        repetitions: [
          {
            numRepetitions: 0,
            episodesWatched: 8,
            status: 0,
            createdAt: new Date(2021, 7, 16, 12, 0, 0).getTime(),
          },
        ],
      }),
      new Date(2021, 7, 16, 12, 0, 0).getTime(),
    ],
    [
      "falls back to the detail creation without repetitions",
      detail({ createdAt: new Date(2026, 6, 31, 12, 0, 0).getTime() }),
      new Date(2026, 6, 31, 12, 0, 0).getTime(),
    ],
    [
      "falls back to the detail creation with an empty repetitions list",
      detail({
        createdAt: new Date(2026, 6, 31, 12, 0, 0).getTime(),
        repetitions: [],
      }),
      new Date(2026, 6, 31, 12, 0, 0).getTime(),
    ],
    ["returns undefined when neither source carries a date", detail(), undefined],
  ])("%s", (_label, input, expected) => {
    expect(deriveHistoryInspectorAddedMs(input)).toBe(expected);
  });
});

describe("deriveHistoryInspectorLastWatchedMs", () => {
  it.each([
    [
      "prefers the newest recent row over the stored last-watched stamp",
      detail({ lastWatchedAt: new Date(2026, 8, 10, 10, 0, 0).getTime() }),
      [
        row(new Date(2026, 8, 11, 20, 3, 0).getTime()),
        row(new Date(2026, 8, 12, 17, 16, 0).getTime()),
      ],
      new Date(2026, 8, 12, 17, 16, 0).getTime(),
    ],
    [
      "prefers the newest row even when rows arrive newest-first",
      detail({ lastWatchedAt: new Date(2026, 8, 10, 10, 0, 0).getTime() }),
      [
        row(new Date(2026, 8, 12, 17, 16, 0).getTime()),
        row(new Date(2026, 8, 11, 20, 3, 0).getTime()),
      ],
      new Date(2026, 8, 12, 17, 16, 0).getTime(),
    ],
    [
      "falls back to the stored last-watched stamp without recent rows",
      detail({ lastWatchedAt: new Date(2026, 8, 10, 10, 0, 0).getTime() }),
      [],
      new Date(2026, 8, 10, 10, 0, 0).getTime(),
    ],
    ["returns undefined when neither source carries a date", detail(), [], undefined],
  ])("%s", (_label, input, rows, expected) => {
    expect(deriveHistoryInspectorLastWatchedMs(input, rows)).toBe(expected);
  });
});

describe("formatHistoryInspectorLastWatched", () => {
  const now = new Date(2026, 8, 13, 12, 0, 0).getTime();

  it.each([
    ["names today", new Date(2026, 8, 13, 9, 5, 0).getTime(), "Today, 09:05"],
    ["names yesterday", new Date(2026, 8, 12, 17, 16, 0).getTime(), "Yesterday, 17:16"],
    ["reads an older day in full", new Date(2026, 8, 11, 20, 3, 0).getTime(), "September 11, 2026, 20:03"],
  ])("%s", (_case, millis, expected) => {
    expect(formatHistoryInspectorLastWatched(millis, now)).toBe(expected);
  });
});

describe("formatHistoryInspectorAdded", () => {
  it("reads the long-form day", () => {
    expect(
      formatHistoryInspectorAdded(new Date(2026, 6, 31, 12, 0, 0).getTime()),
    ).toBe("July 31, 2026");
  });
});

describe("deriveHistoryInspectorProgressRatio", () => {
  it("divides watched by the total", () => {
    expect(deriveHistoryInspectorProgressRatio(detail())).toBeCloseTo(8 / 28);
  });

  it("returns undefined without a total", () => {
    expect(
      deriveHistoryInspectorProgressRatio(detail({ totalEpisodes: undefined })),
    ).toBeUndefined();
  });

  it("returns undefined with a zero total", () => {
    expect(
      deriveHistoryInspectorProgressRatio(detail({ totalEpisodes: 0 })),
    ).toBeUndefined();
  });
});

/**
 * Builds one settled inspector read, overriding only what a case needs.
 * @param data The loaded answer.
 * @param overrides The query fields a case cares about.
 * @returns The read.
 */
function read<TData>(data: TData | undefined, overrides: Partial<HistoryInspectorRead<TData>> = {}): HistoryInspectorRead<TData> {
  return { status: "success", data, error: null, isFetching: false, isPlaceholderData: false, ...overrides };
}

describe("toInspectedData", () => {
  it.each([
    ["a loaded answer", read("x"), "x"],
    ["a pending read", read(undefined, { status: "pending" }), undefined],
    ["a failed read", read("x", { status: "error" }), undefined],
    ["the previous selection's answer", read("x", { isPlaceholderData: true }), undefined],
  ])("reads %s", (_label, query, expected) => {
    expect(toInspectedData(query)).toBe(expected);
  });
});

describe("toHistoryInspectorState", () => {
  /** The three recent rows of the selected anime. */
  const rows = [row(30), row(20)];
  /** A resolved placeholder cover. */
  const cover = { status: "placeholder" } as const;
  /** A loaded recent page. */
  const recent = read({ status: "ok", items: rows });

  it("prompts with no rows and no selection, whatever the reads hold", () => {
    expect(toHistoryInspectorState({ animeId: undefined, detail: read(detail()), recent, cover })).toEqual({
      status: "prompt", detail: undefined, addedMs: undefined, lastWatchedMs: undefined, cover, recentEpisodes: [],
    });
  });

  it.each([
    ["error", read<AnimeDetail>(undefined, { status: "error", error: new Error("not found") })],
    ["loading", read<AnimeDetail>(undefined, { status: "pending" })],
    ["loading", read(detail(), { isPlaceholderData: true })],
  ])("reads %s with the loaded recent rows and no detail", (status, detailRead) => {
    expect(toHistoryInspectorState({ animeId: "anime-1", detail: detailRead, recent, cover })).toEqual({
      status, detail: undefined, addedMs: undefined, lastWatchedMs: undefined, cover, recentEpisodes: rows,
    });
  });

  it("derives the content dates from the detail and the newest recent row", () => {
    const loaded = detail({ createdAt: 5, lastWatchedAt: 7 });

    expect(toHistoryInspectorState({ animeId: "anime-1", detail: read(loaded), recent, cover })).toEqual({
      status: "content", detail: loaded, addedMs: 5, lastWatchedMs: 30, cover, recentEpisodes: rows,
    });
  });

  it("reads a pending or failed recent page as no rows while the content stands", () => {
    for (const page of [read(undefined, { status: "pending" }), read(undefined, { status: "error" })]) {
      const state = toHistoryInspectorState({ animeId: "anime-1", detail: read(detail({ lastWatchedAt: 7 })), recent: page, cover });
      expect(state).toMatchObject({ status: "content", recentEpisodes: [], lastWatchedMs: 7 });
    }
  });
});
