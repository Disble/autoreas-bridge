import { ANIME_CHANGED_EVENT_NAME } from '../../../infrastructure/anime-runtime-source/anime-runtime-source.constants';
import {
  DEVICE_ACKNOWLEDGED_EVENT_NAME,
  PAIRING_TOKEN_CONSUMED_EVENT_NAME,
} from '../../../infrastructure/bridge-runtime-source/bridge-runtime-source.constants';
import { backupSource } from '../../../infrastructure/backup-source/backup-source.helpers';
import { createActivityFeedSource } from '../../../infrastructure/bridge-runtime-source/activity-feed-source.helpers';
import { createActivityWailsSource } from '../../../infrastructure/bridge-runtime-source/activity-source.helpers';
import { createAnimeSource } from '../../../infrastructure/bridge-runtime-source/anime-source.helpers';
import { createDevicesSource } from '../../../infrastructure/bridge-runtime-source/devices-source.helpers';
import { createEpisodeDurationRuntimeSource } from '../../../infrastructure/bridge-runtime-source/episode-duration-runtime-source.helpers';
import { createEpisodesSource } from '../../../infrastructure/bridge-runtime-source/episodes-source.helpers';
import { frontendErrorReporter } from '../../../infrastructure/error-reporting/frontend-error-source.helpers';
import { createReadinessSource } from '../../../infrastructure/readiness/readiness-source.helpers';
import { createSettingsSource } from '../../../infrastructure/settings-source/settings-source.helpers';
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

/**
 * The app's one frontend error reporter, over the `ReportFrontendError` adapter
 * (served by the always-ready shell handle); `shared/error-reporting` reads it here.
 */
export const BRIDGE_FRONTEND_ERROR_REPORTER = frontendErrorReporter;

/**
 * The backup module's bindings: the SQLite status the rail chip reads and the
 * backup export and import commands of Settings.
 */
export const BRIDGE_BACKUP_SOURCE = backupSource;

/** The Wails runtime events the invalidation bridge listens through. */
export const BRIDGE_EVENT_SOURCE = createRuntimeEventSource();

/** The episodes module's reads (`GetEpisodeSchedule`, `GetEpisodeDayCounts`), for Today. */
export const BRIDGE_EPISODES_SOURCE = createEpisodesSource();

/** The Editor durations card's reads and commands, served by the episodes module. */
export const BRIDGE_EPISODE_DURATIONS_SOURCE = createEpisodeDurationRuntimeSource();
/**
 * The anime module's reads (`GetAnimes`, `GetAnimeDetail`, the two watch-history
 * pages, `GetAnimeCover`), for the Catalog, the anime detail page and History.
 */
export const BRIDGE_ANIME_SOURCE = createAnimeSource();

/** The Devices page's bindings: the `api`, `devices` and `sync` modules' reads and commands. */
export const BRIDGE_DEVICES_SOURCE = createDevicesSource();

/** The Activity screen's pin and detail reads, served by the `observability` module. */
export const BRIDGE_ACTIVITY_SOURCE = createActivityWailsSource();

/** The Activity feed's page, overview and drawer reads, served by the `observability` module. */
export const BRIDGE_ACTIVITY_FEED_SOURCE = createActivityFeedSource();

/** The Settings page's bindings: the `settings` module's library root and auto-start reads and commands. */
export const BRIDGE_SETTINGS_SOURCE = createSettingsSource();

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
