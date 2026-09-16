import { describe, expect, it } from "vitest";
import type { AnimeDetail, WatchHistoryEntry } from "../../../../../shared/contracts/anime.types";
import {
  deriveHistoryInspectorAddedMs,
  deriveHistoryInspectorLastWatchedMs,
  deriveHistoryInspectorProgressRatio,
  formatHistoryInspectorAdded,
  formatHistoryInspectorLastWatched,
} from "../history-inspector.helpers";

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
