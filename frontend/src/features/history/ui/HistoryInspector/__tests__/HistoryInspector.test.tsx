import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
  const hookSpy = vi.spyOn(useHistoryInspectorModule, "useHistoryInspector").mockReturnValue({
    detail: undefined,
    addedMs: undefined,
    lastWatchedMs: undefined,
    cover: { status: "placeholder" },
    recentEpisodes: [],
    ...state,
  });

  render(<HistoryInspector animeId="anime-1" onOpenAnime={onOpenAnime} />);

  return { onOpenAnime, hookSpy };
}

describe("HistoryInspector", () => {
  beforeEach(() => {
    // "Last watched" names today/yesterday relative to the clock.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 13, 12, 0, 0));
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("renders the Airis empty state with artwork without an animeId", () => {
    vi.spyOn(useHistoryInspectorModule, "useHistoryInspector").mockReturnValue({
      status: "prompt",
      detail: undefined,
      addedMs: undefined,
      lastWatchedMs: undefined,
      cover: { status: "placeholder" },
      recentEpisodes: [],
    });

    const { container } = render(<HistoryInspector animeId={undefined} onOpenAnime={vi.fn()} />);

    expect(screen.getByRole("heading", { name: "No episode selected" })).toBeDefined();
    expect(screen.getByText("Select an episode to see its anime.")).toBeDefined();
    expect(container.querySelector('img[aria-hidden="true"]')).not.toBeNull();
    expect(screen.queryByRole("img", { name: "No cover art" })).toBeNull();
  });

  it("renders a shape-mirroring skeleton while the detail is unresolved", () => {
    renderInspector({ status: "loading" });

    expect(screen.getByRole("status")).toBeDefined();
    expect(screen.queryByText("Frieren")).toBeNull();
    expect(screen.queryByRole("button", { name: "Open anime detail" })).toBeNull();
  });

  it.each([
    ["an unresolved detail", undefined],
    ["a resolved detail on a failed read", detail()],
  ])("renders the surface error alert for a failed read with %s", (_label, failedDetail) => {
    renderInspector({ status: "error", detail: failedDetail });

    expect(screen.getByText("Could not load the anime detail")).toBeDefined();
    expect(screen.queryByText("Frieren")).toBeNull();
  });

  it("renders the surface error alert when resolved content arrives without a detail", () => {
    renderInspector({ status: "content" });

    expect(screen.getByText("Could not load the anime detail")).toBeDefined();
    expect(screen.queryByText("Frieren")).toBeNull();
  });

  it("renders content with chips, episode count, dates, and the open button", () => {
    const { onOpenAnime, hookSpy } = renderInspector({
      status: "content",
      detail: detail(),
      addedMs: new Date(2026, 6, 31, 12, 0, 0).getTime(),
      lastWatchedMs: new Date(2026, 8, 12, 17, 16, 0).getTime(),
    });

    expect(hookSpy).toHaveBeenCalledWith({ animeId: "anime-1" });
    expect(screen.getByRole("link", { name: "Frieren" })).toBeDefined();
    expect(screen.getByText("8 episodes")).toBeDefined();
    expect(screen.getByText("Watched")).toBeDefined();
    expect(screen.getByText("Yesterday, 17:16")).toBeDefined();
    expect(screen.getByText("July 31, 2026")).toBeDefined();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuetext")).toBe("29%");
    expect(screen.getByRole("img", { name: "No cover art" })).toBeDefined();
    expect(screen.queryByText("Recent episodes")).toBeNull();

    fireEvent.click(screen.getByRole("link", { name: "Frieren" }));

    expect(onOpenAnime).toHaveBeenCalledTimes(1);
    expect(onOpenAnime).toHaveBeenCalledWith("anime-1");

    fireEvent.click(screen.getByRole("button", { name: "Open anime detail" }));

    expect(onOpenAnime).toHaveBeenCalledTimes(2);
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
    expect(screen.getByText("Recent episodes")).toBeDefined();
    expect(screen.getByText("Sep 12 · 20:03")).toBeDefined();
    expect(screen.getByText("Episode 7")).toBeDefined();
  });

  it("renders no recent-episodes section while the detail is unresolved", () => {
    renderInspector({ status: "loading" });

    expect(screen.queryByText("Recent episodes")).toBeNull();
  });
});
