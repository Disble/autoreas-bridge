import { GetMyAnimeListDetail, SearchMyAnimeList } from '../../../wailsjs/go/desktop/App';
import type {
  AnimeMetadataLookupSource,
  MyAnimeListDetailResultDTO,
  MyAnimeListSearchResultDTO,
} from '../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';
import { METADATA_LOOKUP_SOURCE_RUNTIME_UNAVAILABLE_MESSAGE, METADATA_LOOKUP_SOURCE_STATE } from './metadata-lookup-source.constants';
import { hasGoBinding, waitForBindings } from '../wails-bindings.helpers';

/**
 * Creates the singleton runtime-backed metadata lookup source with safe
 * degraded defaults (mirrors `createPreferencesSource`). Every call waits
 * for its own Wails binding to attach -- `SearchMyAnimeList`/
 * `GetMyAnimeListDetail` are generated bindings, so calling them before
 * `window.go.desktop.App` exists throws; a feature must never import them
 * directly for exactly that reason.
 *
 * The degraded default reports `outcome: 'error'`, never a silent empty
 * candidate list -- `useAnimeMetadataLookup` maps an `'error'` outcome to its
 * own `'failed'` state, and a zero-candidate search is a distinct, legitimate
 * outcome (`AnimePatchOutcomeNoOp`) this source must not be confused with.
 */
export function createMetadataLookupSource(): AnimeMetadataLookupSource {
  if (METADATA_LOOKUP_SOURCE_STATE.sharedSource !== null) {
    return METADATA_LOOKUP_SOURCE_STATE.sharedSource;
  }

  METADATA_LOOKUP_SOURCE_STATE.sharedSource = {
    SearchMyAnimeList(query: string): Promise<MyAnimeListSearchResultDTO> {
      return waitForBindings(() => hasGoBinding('SearchMyAnimeList')).then((isReady): Promise<MyAnimeListSearchResultDTO> => {
        return isReady
          ? SearchMyAnimeList(query)
          : Promise.resolve({ outcome: 'error', message: METADATA_LOOKUP_SOURCE_RUNTIME_UNAVAILABLE_MESSAGE, candidates: [] });
      });
    },
    GetMyAnimeListDetail(malId: number): Promise<MyAnimeListDetailResultDTO> {
      return waitForBindings(() => hasGoBinding('GetMyAnimeListDetail')).then((isReady): Promise<MyAnimeListDetailResultDTO> => {
        return isReady
          ? GetMyAnimeListDetail(malId)
          : Promise.resolve({ outcome: 'error', message: METADATA_LOOKUP_SOURCE_RUNTIME_UNAVAILABLE_MESSAGE });
      });
    },
  };

  return METADATA_LOOKUP_SOURCE_STATE.sharedSource;
}

/** Shared metadata lookup source singleton used across features. */
export const metadataLookupSource = createMetadataLookupSource(); // eslint-disable-line dharness/role-file-shape
