import { ANIME_CHANGED_EVENT_NAME } from '../../../infrastructure/anime-runtime-source/anime-runtime-source.constants';
import {
  DEVICE_ACKNOWLEDGED_EVENT_NAME,
  PAIRING_TOKEN_CONSUMED_EVENT_NAME,
} from '../../../infrastructure/bridge-runtime-source/bridge-runtime-source.constants';
import { createActivityFeedSource } from '../../../infrastructure/bridge-runtime-source/activity-feed-source.helpers';
import { createActivityWailsSource } from '../../../infrastructure/bridge-runtime-source/activity-source.helpers';
import { createDevicesSource } from '../../../infrastructure/bridge-runtime-source/devices-source.helpers';
import { createEpisodesSource } from '../../../infrastructure/bridge-runtime-source/episodes-source.helpers';
import { createReadinessSource } from '../../../infrastructure/readiness/readiness-source.helpers';
import { createRuntimeEventSource } from '../../../infrastructure/wails-bindings.helpers';
import { createInvalidationRegistry } from '../invalidation-bridge/invalidation-bridge.helpers';
import { createBridgeQueryClient } from '../query-client/query-client.helpers';
import { DEVICES_CONNECTED_KEY, DEVICES_PAIRING_TOKEN_KEY, episodesKeys } from '../query-keys/query-keys.constants';
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

/** The Devices page's bindings: the `api`, `devices` and `sync` modules' reads and commands. */
export const BRIDGE_DEVICES_SOURCE = createDevicesSource();

/** The Activity screen's pin and detail reads, served by the `observability` module. */
export const BRIDGE_ACTIVITY_SOURCE = createActivityWailsSource();

/** The Activity feed's page, overview and drawer reads, served by the `observability` module. */
export const BRIDGE_ACTIVITY_FEED_SOURCE = createActivityFeedSource();

/**
 * Every context's event→invalidation rules, the one place a context registers
 * them as it migrates (ADR-032, task T4 onward). Episodes: every committed anime
 * change (`anime.changed`, from any writer: this window, mobile, the REST API,
 * downloads) can move a row between days or change a day count. Devices: a
 * consumed pairing token means a new device paired, so the token is spent and
 * the device list grew; a device acknowledgment advances that device's last sync.
 */
export const BRIDGE_INVALIDATIONS = createInvalidationRegistry([
  { event: ANIME_CHANGED_EVENT_NAME, queryKeys: [episodesKeys.all] },
  { event: PAIRING_TOKEN_CONSUMED_EVENT_NAME, queryKeys: [DEVICES_PAIRING_TOKEN_KEY, DEVICES_CONNECTED_KEY] },
  { event: DEVICE_ACKNOWLEDGED_EVENT_NAME, queryKeys: [DEVICES_CONNECTED_KEY] },
]);
