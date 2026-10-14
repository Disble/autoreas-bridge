import { vi } from 'vitest';
import type { EpisodeDurationRuntimeSource } from '../../../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.types';

/**
 * Builds an in-memory Episodes source for tests that render the whole Editor
 * workspace: it answers at once with an empty, folderless section, so no test
 * falls through to the real Wails binding and waits for its offline timeout.
 * Build it once per suite; a new source per render would re-run the section read.
 * @returns The fake source.
 */
export function createEmptyEpisodeDurationSource(): EpisodeDurationRuntimeSource {
  return {
    getEpisodeDurationSection: vi.fn().mockResolvedValue({ outcome: 'ok', folderStatus: 'none', rows: [], beyondTotal: [], tv: false }),
    reanalyzeEpisodeDurations: vi.fn().mockResolvedValue({ outcome: 'ok', status: 'no_folder', filesRecognized: 0, rows: [] }),
    cancelEpisodeReanalysis: vi.fn().mockResolvedValue(undefined),
    saveEpisodeDurations: vi.fn().mockResolvedValue({ outcome: 'applied', changed: 0 }),
    onEpisodeReanalysisProgress: vi.fn(() => () => undefined),
  };
}
