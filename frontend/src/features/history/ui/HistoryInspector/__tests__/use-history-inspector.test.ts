import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BridgeRuntimeSource } from "../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types";
import type { AnimeDetail } from "../../../../../shared/contracts/anime.types";
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
  };
}

describe("useHistoryInspector", () => {
  it("stays on prompt without an animeId and spends no binding call", () => {
    const getAnimeDetail = vi.fn().mockResolvedValue(detail());
    const { result } = renderHook(() =>
      useHistoryInspector({ animeId: undefined }, createSource(getAnimeDetail)),
    );

    expect(result.current.status).toBe("prompt");
    expect(getAnimeDetail).not.toHaveBeenCalled();
  });

  it("resolves content with the detail-derived dates", async () => {
    const { result } = renderHook(() =>
      useHistoryInspector(
        { animeId: "anime-1" },
        createSource(vi.fn().mockResolvedValue(detail({
          lastWatchedAt: new Date(2026, 8, 10, 10, 0, 0).getTime(),
          createdAt: new Date(2026, 6, 31, 12, 0, 0).getTime(),
        }))),
      ),
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
    const { result } = renderHook(() =>
      useHistoryInspector(
        { animeId: "anime-1" },
        createSource(getAnimeDetail),
      ),
    );

    await waitFor(() => expect(result.current.status).toBe("error"));
  });
});
