import { createElement } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BridgeRuntimeSource } from "../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types";
import type { AnimeDetail, AnimeWatchHistoryPageRequest, WatchHistoryEntry } from "../../../../../shared/contracts/anime.types";
import { useHistoryInspector } from "../use-history-inspector";

/** Builds the smallest detail fixture the inspector hook resolves. */
function detail(overrides: Partial<AnimeDetail> = {}): AnimeDetail {
  return {
    id: "anime-1",
    name: "Frieren",
    status: 0,
    episodesWatched: 8,
    active: 1,
    genres: [],
    firstCycle: 1,
    days: [],
    modified_at: 0,
    ...overrides,
  };
}

/** Builds a runtime source with a caller-controlled detail read. */
function createSource(
  getAnimeDetail: BridgeRuntimeSource["getAnimeDetail"],
  overrides: Partial<BridgeRuntimeSource> = {},
): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes: vi.fn(),
    getAnimeDetail,
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
    ...overrides,
  };
}

/** Builds one watch-history row for the given anime and episode. */
function episodeRow(animeId: string, episode: number): WatchHistoryEntry {
  return {
    id: episode,
    animeId,
    animeName: "Frieren",
    episode,
    cycle: 1,
    watchedAtMs: new Date(2026, 8, 12 - episode, 20, 3, 0).getTime(),
    source: "test",
  };
}

describe("useHistoryInspector", () => {
  it("stays on prompt without an animeId and spends no binding call", () => {
    const getAnimeDetail = vi.fn().mockResolvedValue(detail());
    const getAnimeWatchHistoryPage = vi.fn();
    // Hoisted: an inline source refires every effect per render; the cover
    // hook's placeholder reset would then loop synchronously until OOM.
    const source = createSource(getAnimeDetail, { getAnimeWatchHistoryPage });
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: undefined }, source),
    );

    expect(result.current.status).toBe("prompt");
    expect(result.current.recentEpisodes).toEqual([]);
    expect(getAnimeDetail).not.toHaveBeenCalled();
    expect(getAnimeWatchHistoryPage).not.toHaveBeenCalled();
  });

  it("reads loading with no episodes while the detail resolves", () => {
    // Hoisted: see above.
    const source = createSource(vi.fn().mockReturnValue(new Promise<AnimeDetail | null>(() => {})));
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: "anime-1" }, source),
    );

    expect(result.current.status).toBe("loading");
    expect(result.current.detail).toBeUndefined();
    expect(result.current.recentEpisodes).toEqual([]);
  });

  it("paints no episodes on the very first commit while loading", () => {
    // The line-99 reset overwrites the initial rows in the same act cycle,
    // so only a first-commit probe can tell a seeded initial state apart.
    const source = createSource(vi.fn().mockReturnValue(new Promise<AnimeDetail | null>(() => {})));
    let firstPaint: readonly WatchHistoryEntry[] | undefined;
    /** Captures the hook state of the very first commit, before effects flush. */
    function Probe(): null {
      const state = useHistoryInspector({ animeId: "anime-1" }, source);
      if (firstPaint === undefined) {
        firstPaint = state.recentEpisodes;
      }
      return null;
    }

    render(createElement(Probe));

    expect(firstPaint).toEqual([]);
  });

  it("resolves content with the detail-derived dates", async () => {
    // Hoisted: see above.
    const source = createSource(vi.fn().mockResolvedValue(detail({
      lastWatchedAt: new Date(2026, 8, 10, 10, 0, 0).getTime(),
      createdAt: new Date(2026, 6, 31, 12, 0, 0).getTime(),
    })));
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: "anime-1" }, source),
    );

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(result.current.detail?.name).toBe("Frieren");
    expect(result.current.lastWatchedMs).toBe(new Date(2026, 8, 10, 10, 0, 0).getTime());
    expect(result.current.addedMs).toBe(new Date(2026, 6, 31, 12, 0, 0).getTime());
  });

  it("ignores a superseded animeId's late response", async () => {
    let resolveFirst!: (value: AnimeDetail | null) => void;
    const getAnimeDetail = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<AnimeDetail | null>((resolve) => { resolveFirst = resolve; }),
      )
      .mockImplementationOnce(() => Promise.resolve(detail({ id: "anime-2", name: "Bocchi the Rock" })));
    // Hoisted: a fresh wrapper per render would refetch on every snapshot
    // update and exhaust the two planned reads.
    const source = createSource(getAnimeDetail);
    const { result, rerender } = renderHook(
      ({ animeId }: { readonly animeId: string }) =>
        useHistoryInspector({ animeId }, source),
      { initialProps: { animeId: "anime-1" } },
    );

    rerender({ animeId: "anime-2" });
    resolveFirst(detail({ id: "anime-1", name: "Frieren" }));

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(result.current.detail?.name).toBe("Bocchi the Rock");
  });

  it.each([
    ["a null detail", vi.fn().mockResolvedValue(null)],
    ["a rejected detail read", vi.fn().mockRejectedValue(new Error("detail unavailable"))],
  ])("surfaces an error on %s", async (_label, getAnimeDetail) => {
    // Hoisted: see above.
    const source = createSource(getAnimeDetail);
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: "anime-1" }, source),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
  });

  it("calls getAnimeCover only with a stored cover path and surfaces the resolved cover", async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: "cover", dataUrl: "data:image/png;base64,abc" });
    // Hoisted: an inline source would refetch on every snapshot update.
    const source = createSource(
      vi.fn().mockResolvedValue(detail({ cover: "covers/frieren.jpg" })),
      { getAnimeCover },
    );
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: "anime-1" }, source),
    );

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(getAnimeCover).toHaveBeenCalledWith("anime-1");
    expect(result.current.cover).toEqual({ status: "cover", dataUrl: "data:image/png;base64,abc" });
  });

  it.each([
    ["an empty stored path", ""],
    ["the null sentinel stored path", "null"],
    ["a missing stored path", undefined],
  ])("never calls getAnimeCover on %s and stays on the placeholder", async (_label, cover) => {
    const getAnimeCover = vi.fn();
    // Hoisted: an inline source would refetch on every snapshot update.
    const source = createSource(
      vi.fn().mockResolvedValue(detail({ cover })),
      { getAnimeCover },
    );
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: "anime-1" }, source),
    );

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(getAnimeCover).not.toHaveBeenCalled();
    expect(result.current.cover).toEqual({ status: "placeholder" });
  });

  it("fetches the 3 most recent episodes for the selected anime", async () => {
    const rows = [episodeRow("anime-1", 8), episodeRow("anime-1", 7), episodeRow("anime-1", 6)];
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue({ status: "ok", items: rows });
    // Hoisted: an inline source would refetch on every snapshot update.
    const source = createSource(
      vi.fn().mockResolvedValue(detail()),
      { getAnimeWatchHistoryPage },
    );
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: "anime-1" }, source),
    );

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(getAnimeWatchHistoryPage).toHaveBeenCalledWith({ animeId: "anime-1", cycle: 0, cursor: "", limit: 3 });
    expect(result.current.recentEpisodes).toEqual(rows);
  });

  it("ignores a superseded animeId's late episodes page", async () => {    let resolveFirst!: (value: { readonly status: string; readonly items: readonly WatchHistoryEntry[] }) => void;
    const getAnimeWatchHistoryPage = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<{ readonly status: string; readonly items: readonly WatchHistoryEntry[] }>((resolve) => { resolveFirst = resolve; }),
      )
      .mockImplementationOnce(() => Promise.resolve({ status: "ok", items: [episodeRow("anime-2", 3)] }));
    const source = createSource(
      vi.fn().mockImplementation((animeId: string) => Promise.resolve(detail({ id: animeId }))),
      { getAnimeWatchHistoryPage },
    );
    const { result, rerender } = renderHook(
      ({ animeId }: { readonly animeId: string }) =>
        useHistoryInspector({ animeId }, source),
      { initialProps: { animeId: "anime-1" } },
    );

    rerender({ animeId: "anime-2" });
    resolveFirst({ status: "ok", items: [episodeRow("anime-1", 8)] });

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(result.current.detail?.id).toBe("anime-2");
    expect(result.current.recentEpisodes).toEqual([episodeRow("anime-2", 3)]);
  });

  it("reads a stale snapshot as loading while the next anime resolves", async () => {
    let resolveFirst!: (value: AnimeDetail | null) => void;
    const getAnimeDetail = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<AnimeDetail | null>((resolve) => { resolveFirst = resolve; }),
      )
      .mockImplementationOnce(() => new Promise<AnimeDetail | null>(() => {}));
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue({ status: "ok", items: [] });
    // Hoisted: a fresh wrapper per render would refetch on every snapshot
    // update and exhaust the two planned reads.
    const source = createSource(getAnimeDetail, { getAnimeWatchHistoryPage });
    const { result, rerender } = renderHook(
      ({ animeId }: { readonly animeId: string }) =>
        useHistoryInspector({ animeId }, source),
      { initialProps: { animeId: "anime-1" } },
    );

    resolveFirst(detail({ id: "anime-1", name: "Frieren" }));
    await waitFor(() => expect(result.current.status).toBe("content"));

    rerender({ animeId: "anime-2" });

    expect(result.current.status).toBe("loading");
    expect(result.current.detail).toBeUndefined();
  });

  it("clears the previous episodes while the next anime's page loads", async () => {
    const rowsA = [episodeRow("anime-1", 8), episodeRow("anime-1", 7)];
    const getAnimeWatchHistoryPage = vi
      .fn()
      .mockImplementation((request: AnimeWatchHistoryPageRequest) =>
        request.animeId === "anime-1"
          ? Promise.resolve({ status: "ok", items: rowsA })
          : new Promise(() => {}),
      );
    // Hoisted: see above.
    const source = createSource(
      vi.fn().mockImplementation((animeId: string) => Promise.resolve(detail({ id: animeId }))),
      { getAnimeWatchHistoryPage },
    );
    const { result, rerender } = renderHook(
      ({ animeId }: { readonly animeId: string }) =>
        useHistoryInspector({ animeId }, source),
      { initialProps: { animeId: "anime-1" } },
    );

    await waitFor(() => expect(result.current.recentEpisodes).toEqual(rowsA));

    rerender({ animeId: "anime-2" });

    expect(result.current.status).toBe("loading");
    expect(result.current.recentEpisodes).toEqual([]);
  });

  it("never contributes an error page's rows", async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue({
      status: "error",
      message: "history unavailable",
      items: [episodeRow("anime-1", 8)],
    });
    // Hoisted: an inline source would refetch on every snapshot update.
    const source = createSource(
      vi.fn().mockResolvedValue(detail()),
      { getAnimeWatchHistoryPage },
    );
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: "anime-1" }, source),
    );

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(result.current.recentEpisodes).toEqual([]);
  });

  it("never lets a superseded rejection clobber resolved content", async () => {
    let rejectFirst!: (reason: Error) => void;
    const getAnimeDetail = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise<AnimeDetail | null>((_resolve, reject) => { rejectFirst = reject; }),
      )
      .mockImplementationOnce(() => Promise.resolve(detail({ id: "anime-2", name: "Bocchi the Rock" })));
    // Hoisted: a fresh wrapper per render would refetch on every snapshot
    // update and exhaust the two planned reads.
    const source = createSource(getAnimeDetail);
    const { result, rerender } = renderHook(
      ({ animeId }: { readonly animeId: string }) =>
        useHistoryInspector({ animeId }, source),
      { initialProps: { animeId: "anime-1" } },
    );

    rerender({ animeId: "anime-2" });
    await waitFor(() => expect(result.current.detail?.id).toBe("anime-2"));

    // Forced flush: without act the superseded snapshot lands whenever the
    // loop gets there, so a polling assertion can win the race and go blind.
    await act(async () => {
      rejectFirst(new Error("late detail failure"));
    });

    expect(result.current.status).toBe("content");
    expect(result.current.detail?.name).toBe("Bocchi the Rock");
  });
});
