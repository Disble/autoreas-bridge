import { createElement, type ComponentType, type ReactNode } from 'react';
import { vi } from 'vitest';
import type { EpisodeDurationRuntimeSource } from '../../../../../shared/contracts/episode-durations.types';
import { createModulesTestWrapper } from '../../../../../shared/query/test-support/bridge-modules.test-support';
import { status } from '../../../../../shared/query/test-support/readiness-source.test-support';

/** Props of a test wrapper component. */
interface WrapperProps {
  readonly children: ReactNode;
}

/**
 * Builds an in-memory Episodes source for tests that render the whole Editor
 * workspace: it answers at once with an empty, folderless section, so no test
 * falls through to the real Wails binding and waits for its offline timeout.
 * Build it once per suite; a new source per render would re-run the section read.
 * @returns The fake source.
 */
export function createEmptyEpisodeDurationSource(): EpisodeDurationRuntimeSource {
  return {
    getEpisodeDurationSection: vi.fn().mockResolvedValue({ folderStatus: 'none', rows: [], beyondTotal: [], tv: false }),
    reanalyzeEpisodeDurations: vi.fn().mockResolvedValue({ outcome: 'ok', status: 'no_folder', filesRecognized: 0, rows: [] }),
    cancelEpisodeReanalysis: vi.fn().mockResolvedValue(undefined),
    saveEpisodeDurations: vi.fn().mockResolvedValue({ outcome: 'applied', changed: 0 }),
    onEpisodeReanalysisProgress: vi.fn(() => () => undefined),
  };
}

/**
 * Builds a wrapper for tests that render the whole Editor workspace: the
 * Episodes card, the list, the record and the schedule board read through
 * `useBridgeQuery`, so the tree needs a query client whose `episodes` and
 * `anime` modules are ready.
 * @param inner An optional wrapper rendered inside it, such as a router.
 * @returns The wrapper component; build one per render.
 */
export function createEpisodesReadyWrapper(inner?: ComponentType<WrapperProps>): ComponentType<WrapperProps> {
  const { wrapper: QueryWrapper } = createModulesTestWrapper(status('episodes', 'ready'), status('anime', 'ready'));
  /**
   * Renders the children inside the query client and the optional inner wrapper.
   * @param props The children.
   * @returns The wrapped tree.
   */
  function EpisodesReadyWrapper({ children }: Readonly<WrapperProps>) {
    return createElement(QueryWrapper, undefined, inner === undefined ? children : createElement(inner, undefined, children));
  }
  return EpisodesReadyWrapper;
}
