import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BridgeRuntimeSource } from "../../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types";
import type { Anime } from "../../../../../shared/contracts/anime.types";
import { useHistoryAnimeScope } from "../use-history-anime-scope";

/** Builds the smallest catalog fixture needed to resolve a History filter scope. */
function anime(overrides: Partial<Anime> = {}): Anime {
  return {
    id: "anime-1",
    name: "Frieren",
    status: 0,
    episodesWatched: 1,
    active: 1,
    days: [],
    genres: [],
    hasDownloadPage: false,
    hasFolder: false,
    ...overrides,
  };
}

/** Builds a runtime source with a caller-controlled catalog read. */
function createSource(
  getAnimes: BridgeRuntimeSource["getAnimes"],
): BridgeRuntimeSource {
  return {
    getSQLiteStatus: vi.fn(),
    getEffectiveAddress: vi.fn(),
    getPairingToken: vi.fn(),
    getSyncingAnimeItems: vi.fn(),
    getAnimes,
    getAnimeDetail: vi.fn(),
    triggerReconcile: vi.fn(),
    onPairingTokenConsumed: vi.fn().mockReturnValue(() => undefined),
  };
}

describe("useHistoryAnimeScope", () => {
  it.each<
    [
      string,
      BridgeRuntimeSource["getAnimes"],
      number | undefined,
      { readonly scope: unknown; readonly error: Error | undefined },
    ]
  >([
    [
      "resolves the current-status scope after the catalog succeeds",
      vi.fn().mockResolvedValue([anime({ id: "matching", status: 1 })]),
      1,
      { scope: { kind: "ids", ids: ["matching"] }, error: undefined },
    ],
    [
      "preserves a catalog rejection as an error",
      vi.fn().mockRejectedValue(new Error("catalog unavailable")),
      undefined,
      { scope: undefined, error: new Error("catalog unavailable") },
    ],
  ])("%s", async (_label, getAnimes, status, expected) => {
    const { result } = renderHook(() =>
      useHistoryAnimeScope(status, undefined, createSource(getAnimes)),
    );

    await waitFor(() =>
      expect(
        result.current.catalog === undefined &&
          result.current.error === undefined,
      ).toBe(false),
    );

    expect(result.current.scope).toEqual(expected.scope);
    expect(result.current.error).toEqual(expected.error);
  });
});
