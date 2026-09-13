import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AnimeDetail } from "../../../../../shared/contracts/anime.types";
import type { HistoryInspectorState } from "../history-inspector.types";
import { HistoryInspector } from "../HistoryInspector";
import * as useHistoryInspectorModule from "../use-history-inspector";

/** Builds the smallest detail fixture the inspector content renders. */
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

/** Renders HistoryInspector with the inspector hook stubbed to the given state. */
function renderInspector(state: Partial<HistoryInspectorState> & { readonly status: HistoryInspectorState["status"] }) {
  const onOpenAnime = vi.fn();
  vi.spyOn(useHistoryInspectorModule, "useHistoryInspector").mockReturnValue({
    detail: undefined,
    addedMs: undefined,
    lastWatchedMs: undefined,
    cover: { status: "placeholder" },
    recentEpisodes: [],
    ...state,
  });

  render(<HistoryInspector animeId="anime-1" onOpenAnime={onOpenAnime} />);

  return { onOpenAnime };
}

describe("HistoryInspector", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders a compact prompt without an animeId", () => {
    vi.spyOn(useHistoryInspectorModule, "useHistoryInspector").mockReturnValue({
      status: "prompt",
      detail: undefined,
      addedMs: undefined,
      lastWatchedMs: undefined,
      cover: { status: "placeholder" },
      recentEpisodes: [],
    });

    render(<HistoryInspector animeId={undefined} onOpenAnime={vi.fn()} />);

    expect(screen.getByText("Select an episode to see its anime")).toBeDefined();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders a shape-mirroring skeleton while the detail is unresolved", () => {
    renderInspector({ status: "loading" });

    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.queryByText("Frieren")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open anime detail" })).toBeNull();
  });

  it("renders the surface error alert on a null detail", () => {
    renderInspector({ status: "error" });

    expect(screen.getByText("Could not load the anime detail")).toBeDefined();
    expect(screen.queryByText("Frieren")).toBeNull();
  });

  it("renders content with chips, episode count, dates, and the open button", () => {
    const { onOpenAnime } = renderInspector({
      status: "content",
      detail: detail(),
      addedMs: new Date(2026, 6, 31, 12, 0, 0).getTime(),
      lastWatchedMs: new Date(2026, 8, 12, 17, 16, 0).getTime(),
    });

    expect(screen.getByRole("link", { name: "Frieren" })).toBeDefined();
    expect(screen.getByText("8 episodes")).toBeDefined();
    expect(screen.getByText("September 12, 2026, 17:16")).toBeDefined();
    expect(screen.getByText("July 31, 2026")).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Open anime detail" }));

    expect(onOpenAnime).toHaveBeenCalledWith("anime-1");
  });

  it("renders the progress bar only when the anime has a total", () => {
    renderInspector({
      status: "content",
      detail: detail({ totalEpisodes: undefined }),
      addedMs: undefined,
      lastWatchedMs: undefined,
    });

    expect(screen.getByText("8 episodes")).toBeDefined();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("renders the resolved cover from the shared hook instead of the placeholder", () => {
    renderInspector({
      status: "content",
      detail: detail(),
      cover: { status: "cover", dataUrl: "data:image/png;base64,abc" },
    });

    const image = screen.getByRole("img");

    expect(image.getAttribute("src")).toBe("data:image/png;base64,abc");
  });

  it("renders the recent episodes with their formatted watch dates", () => {
    renderInspector({
      status: "content",
      detail: detail(),
      recentEpisodes: [
        {
          id: 8,
          animeId: "anime-1",
          animeName: "Frieren",
          episode: 8,
          cycle: 1,
          watchedAtMs: new Date(2026, 8, 12, 20, 3, 0).getTime(),
          source: "test",
        },
        {
          id: 7,
          animeId: "anime-1",
          animeName: "Frieren",
          episode: 7,
          cycle: 1,
          watchedAtMs: new Date(2026, 8, 11, 20, 3, 0).getTime(),
          source: "test",
        },
      ],
    });

    expect(screen.getByText("Episode 8")).toBeDefined();
    expect(screen.getByText(/Sat, Sep 12 · 20:03/)).toBeDefined();
    expect(screen.getByText("Episode 7")).toBeDefined();
  });

  it("renders no recent-episodes section while the detail is unresolved", () => {
    renderInspector({ status: "loading" });

    expect(screen.queryByText("Recent episodes")).toBeNull();
  });
});
