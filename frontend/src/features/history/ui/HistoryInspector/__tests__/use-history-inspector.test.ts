import { createElement } from "react";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { AnimeSource } from "../../../../../shared/contracts/anime-source.types";
import type { AnimeDetail, AnimeWatchHistoryPageRequest, WatchHistoryEntry, WatchHistoryPage } from "../../../../../shared/contracts/anime.types";
import type { ModuleReadiness } from "../../../../../shared/contracts/readiness.types";
import { createBridgeError } from "../../../../../shared/query/bridge-error/bridge-error.helpers";
import { createModulesTestWrapper } from "../../../../../shared/query/test-support/bridge-modules.test-support";
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

/** Builds an anime source with a caller-controlled detail read; the recent page answers no rows by default. */
function createSource(getAnimeDetail: AnimeSource["getAnimeDetail"], overrides: Partial<AnimeSource> = {}): AnimeSource {
  return {
    getAnimes: vi.fn(),
    getAnimeDetail,
    getWatchHistoryPage: vi.fn(),
    getAnimeWatchHistoryPage: vi.fn().mockResolvedValue({ status: "ok", items: [] }),
    getAnimeCover: vi.fn().mockResolvedValue({ source: "placeholder" }),
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

/**
 * Renders the hook for one selection inside a query wrapper reporting the `anime` module.
 * @param source The anime source the hook reads.
 * @param animeId The initial selection.
 * @param anime The `anime` module's readiness.
 * @returns The rendered hook and `emit`, which pushes a readiness change.
 */
function renderInspector(source: AnimeSource, animeId: string | undefined, anime: ModuleReadiness = { module: "anime", state: "ready" }) {
  const { wrapper, emit } = createModulesTestWrapper(anime);
  const rendered = renderHook(
    (props: { readonly animeId: string | undefined }) => useHistoryInspector({ animeId: props.animeId }, source),
    { initialProps: { animeId }, wrapper },
  );
  return { ...rendered, emit };
}

describe("useHistoryInspector", () => {
  it("stays on prompt without an animeId and spends no binding call", async () => {
    const source = createSource(vi.fn().mockResolvedValue(detail()));
    const { result } = renderInspector(source, undefined);
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("prompt");
    expect(result.current.recentEpisodes).toEqual([]);
    expect(source.getAnimeDetail).not.toHaveBeenCalled();
    expect(source.getAnimeWatchHistoryPage).not.toHaveBeenCalled();
  });

  it("reads loading with no episodes while the detail resolves", () => {
    const { result } = renderInspector(createSource(vi.fn().mockReturnValue(new Promise<AnimeDetail>(() => {}))), "anime-1");

    expect(result.current.status).toBe("loading");
    expect(result.current.detail).toBeUndefined();
    expect(result.current.recentEpisodes).toEqual([]);
  });

  it("paints no episodes on the very first commit while loading", () => {
    const source = createSource(vi.fn().mockReturnValue(new Promise<AnimeDetail>(() => {})));
    let firstPaint: readonly WatchHistoryEntry[] | undefined;
    /** Captures the hook state of the very first commit, before effects flush. */
    function Probe(): null {
      const state = useHistoryInspector({ animeId: "anime-1" }, source);
      if (firstPaint === undefined) {
        firstPaint = state.recentEpisodes;
      }
      return null;
    }

    render(createElement(Probe), createModulesTestWrapper({ module: "anime", state: "ready" }));

    expect(firstPaint).toEqual([]);
  });

  it("stays loading without reading while the anime module starts, then resolves once ready", async () => {
    const source = createSource(vi.fn().mockResolvedValue(detail()));
    const { result, emit } = renderInspector(source, "anime-1", { module: "anime", state: "starting" });
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.status).toBe("loading");
    expect(source.getAnimeDetail).not.toHaveBeenCalled();

    act(() => emit({ module: "anime", state: "ready" }));
    await waitFor(() => expect(result.current.status).toBe("content"));
  });

  it("resolves content with the detail-derived dates", async () => {
    const source = createSource(vi.fn().mockResolvedValue(detail({
      lastWatchedAt: new Date(2026, 8, 10, 10, 0, 0).getTime(),
      createdAt: new Date(2026, 6, 31, 12, 0, 0).getTime(),
    })));
    const { result } = renderInspector(source, "anime-1");

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(source.getAnimeDetail).toHaveBeenCalledWith("anime-1");
    expect(result.current.detail?.name).toBe("Frieren");
    expect(result.current.lastWatchedMs).toBe(new Date(2026, 8, 10, 10, 0, 0).getTime());
    expect(result.current.addedMs).toBe(new Date(2026, 6, 31, 12, 0, 0).getTime());
  });

  it("ignores a superseded animeId's late response", async () => {
    let resolveFirst!: (value: AnimeDetail) => void;
    const getAnimeDetail = vi.fn((animeId: string) =>
      animeId === "anime-1"
        ? new Promise<AnimeDetail>((resolve) => { resolveFirst = resolve; })
        : Promise.resolve(detail({ id: "anime-2", name: "Bocchi the Rock" })),
    );
    const { result, rerender } = renderInspector(createSource(getAnimeDetail), "anime-1");
    await waitFor(() => expect(getAnimeDetail).toHaveBeenCalledWith("anime-1"));

    rerender({ animeId: "anime-2" });
    resolveFirst(detail({ id: "anime-1", name: "Frieren" }));

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(result.current.detail?.name).toBe("Bocchi the Rock");
  });

  it.each([
    ["an unknown anime", createBridgeError("not_found", "anime anime-1 not found")],
    ["a failed detail read", createBridgeError("internal", "detail unavailable")],
  ])("surfaces an error on %s", async (_label, rejection) => {
    const { result } = renderInspector(createSource(vi.fn().mockRejectedValue(rejection)), "anime-1");

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.detail).toBeUndefined();
  });

  it("surfaces an error, without reading, when the anime module failed", async () => {
    const source = createSource(vi.fn().mockResolvedValue(detail()));
    const { result } = renderInspector(source, "anime-1", { module: "anime", state: "failed", reason: "anime: db closed" });

    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(source.getAnimeDetail).not.toHaveBeenCalled();
  });

  it("calls getAnimeCover only with a stored cover path and surfaces the resolved cover", async () => {
    const getAnimeCover = vi.fn().mockResolvedValue({ source: "cover", dataUrl: "data:image/png;base64,abc" });
    const source = createSource(vi.fn().mockResolvedValue(detail({ cover: "covers/frieren.jpg" })), { getAnimeCover });
    const { result } = renderInspector(source, "anime-1");

    await waitFor(() => expect(result.current.cover).toEqual({ status: "cover", dataUrl: "data:image/png;base64,abc" }));

    expect(getAnimeCover).toHaveBeenCalledWith("anime-1");
    expect(result.current.status).toBe("content");
  });

  it.each([
    ["an empty stored path", ""],
    ["the null sentinel stored path", "null"],
    ["a missing stored path", undefined],
  ])("never calls getAnimeCover on %s and stays on the placeholder", async (_label, cover) => {
    const getAnimeCover = vi.fn();
    const source = createSource(vi.fn().mockResolvedValue(detail({ cover })), { getAnimeCover });
    const { result } = renderInspector(source, "anime-1");

    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(getAnimeCover).not.toHaveBeenCalled();
    expect(result.current.cover).toEqual({ status: "placeholder" });
  });

  it("fetches the 3 most recent episodes for the selected anime", async () => {
    const rows = [episodeRow("anime-1", 8), episodeRow("anime-1", 7), episodeRow("anime-1", 6)];
    const getAnimeWatchHistoryPage = vi.fn().mockResolvedValue({ status: "ok", items: rows });
    const { result } = renderInspector(createSource(vi.fn().mockResolvedValue(detail()), { getAnimeWatchHistoryPage }), "anime-1");

    await waitFor(() => expect(result.current.recentEpisodes).toEqual(rows));

    expect(getAnimeWatchHistoryPage).toHaveBeenCalledWith({ animeId: "anime-1", cycle: 0, cursor: "", limit: 3 });
    expect(result.current.status).toBe("content");
  });

  it("ignores a superseded animeId's late episodes page", async () => {
    let resolveFirst!: (value: WatchHistoryPage) => void;
    const getAnimeWatchHistoryPage = vi.fn((request: AnimeWatchHistoryPageRequest) =>
      request.animeId === "anime-1"
        ? new Promise<WatchHistoryPage>((resolve) => { resolveFirst = resolve; })
        : Promise.resolve({ status: "ok", items: [episodeRow("anime-2", 3)] }),
    );
    const source = createSource(vi.fn((animeId: string) => Promise.resolve(detail({ id: animeId }))), { getAnimeWatchHistoryPage });
    const { result, rerender } = renderInspector(source, "anime-1");
    await waitFor(() => expect(getAnimeWatchHistoryPage).toHaveBeenCalledTimes(1));

    rerender({ animeId: "anime-2" });
    resolveFirst({ status: "ok", items: [episodeRow("anime-1", 8)] });

    await waitFor(() => expect(result.current.recentEpisodes).toEqual([episodeRow("anime-2", 3)]));
    expect(result.current.detail?.id).toBe("anime-2");
  });

  it("reads the previous anime's detail as loading while the next anime resolves", async () => {
    const getAnimeDetail = vi.fn((animeId: string) =>
      animeId === "anime-1" ? Promise.resolve(detail({ id: "anime-1", name: "Frieren" })) : new Promise<AnimeDetail>(() => {}),
    );
    const { result, rerender } = renderInspector(createSource(getAnimeDetail), "anime-1");
    await waitFor(() => expect(result.current.status).toBe("content"));

    rerender({ animeId: "anime-2" });

    expect(result.current.status).toBe("loading");
    expect(result.current.detail).toBeUndefined();
  });

  it("clears the previous episodes while the next anime's page loads", async () => {
    const rowsA = [episodeRow("anime-1", 8), episodeRow("anime-1", 7)];
    const getAnimeWatchHistoryPage = vi.fn((request: AnimeWatchHistoryPageRequest) =>
      request.animeId === "anime-1" ? Promise.resolve({ status: "ok", items: rowsA }) : new Promise<WatchHistoryPage>(() => {}),
    );
    const source = createSource(vi.fn((animeId: string) => Promise.resolve(detail({ id: animeId }))), { getAnimeWatchHistoryPage });
    const { result, rerender } = renderInspector(source, "anime-1");

    await waitFor(() => expect(result.current.recentEpisodes).toEqual(rowsA));

    rerender({ animeId: "anime-2" });

    expect(result.current.status).toBe("loading");
    expect(result.current.recentEpisodes).toEqual([]);
  });

  it("keeps the content with no episodes when the recent page fails", async () => {
    const getAnimeWatchHistoryPage = vi.fn().mockRejectedValue(createBridgeError("internal", "history unavailable"));
    const { result } = renderInspector(createSource(vi.fn().mockResolvedValue(detail()), { getAnimeWatchHistoryPage }), "anime-1");

    await waitFor(() => expect(getAnimeWatchHistoryPage).toHaveBeenCalled());
    await waitFor(() => expect(result.current.status).toBe("content"));

    expect(result.current.recentEpisodes).toEqual([]);
  });

  it("never lets a superseded rejection clobber resolved content", async () => {
    let rejectFirst!: (reason: Error) => void;
    const getAnimeDetail = vi.fn((animeId: string) =>
      animeId === "anime-1"
        ? new Promise<AnimeDetail>((_resolve, reject) => { rejectFirst = reject; })
        : Promise.resolve(detail({ id: "anime-2", name: "Bocchi the Rock" })),
    );
    const { result, rerender } = renderInspector(createSource(getAnimeDetail), "anime-1");
    await waitFor(() => expect(getAnimeDetail).toHaveBeenCalledWith("anime-1"));

    rerender({ animeId: "anime-2" });
    await waitFor(() => expect(result.current.detail?.id).toBe("anime-2"));

    await act(async () => {
      rejectFirst(new Error("late detail failure"));
    });

    expect(result.current.status).toBe("content");
    expect(result.current.detail?.name).toBe("Bocchi the Rock");
  });
});
