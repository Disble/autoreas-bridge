import { ANIME_CHANGED_EVENT_NAME } from '../../../infrastructure/anime-runtime-source/anime-runtime-source.constants';
import { createEpisodesSource } from '../../../infrastructure/bridge-runtime-source/episodes-source.helpers';
import { createReadinessSource } from '../../../infrastructure/readiness/readiness-source.helpers';
import { createRuntimeEventSource } from '../../../infrastructure/wails-bindings.helpers';
import { createInvalidationRegistry } from '../invalidation-bridge/invalidation-bridge.helpers';
import { createBridgeQueryClient } from '../query-client/query-client.helpers';
import { episodesKeys } from '../query-keys/query-keys.constants';
import { createReadinessGate } from '../readiness-gate/readiness-gate.helpers';

// The one composition module of `shared/query` (ADR-032 §4): the only file here
// that imports `infrastructure/**`. Every other `shared/query` file depends on
// ports; `src/app` only mounts `BridgeQueryProvider` with these values, and
// feature hooks read each context's source from here.

/** The app's one query client, with the Bridge IPC defaults. */
export const BRIDGE_QUERY_CLIENT = createBridgeQueryClient();

/** The app's one readiness gate, over the Wails `GetReadiness` + `bridge.readiness` adapter. */
export const BRIDGE_READINESS_GATE = createReadinessGate(createReadinessSource());

/** The Wails runtime events the invalidation bridge listens through. */
export const BRIDGE_EVENT_SOURCE = createRuntimeEventSource();

/** The episodes module's reads (`GetEpisodeSchedule`, `GetEpisodeDayCounts`), for Today. */
export const BRIDGE_EPISODES_SOURCE = createEpisodesSource();

/**
 * Every context's event→invalidation rules, the one place a context registers
 * them as it migrates (ADR-032, task T4 onward). Episodes: every committed anime
 * change (`anime.changed`, from any writer: this window, mobile, the REST API,
 * downloads) can move a row between days or change a day count.
 */
export const BRIDGE_INVALIDATIONS = createInvalidationRegistry([{ event: ANIME_CHANGED_EVENT_NAME, queryKeys: [episodesKeys.all] }]);
