import { defineQueryKeys } from './query-keys.helpers';

// Each migrated context's key factory lives here, in `shared/query`, because the
// invalidation rules in `bridge-runtime.constants.ts` name its prefix and shared
// code cannot import features (ADR-032 §4).

/**
 * Keys of the episodes module's reads (Today): `episodesKeys.key('schedule', day)`
 * and `episodesKeys.key('day-counts')`; `episodesKeys.all` is their common prefix.
 */
export const episodesKeys = defineQueryKeys('episodes');

/**
 * Keys of the anime module's reads: `animeKeys.key('list')` (the catalog the
 * Catalog page and the History filters share), `animeKeys.key('detail', animeId)`,
 * `animeKeys.key('cover', animeId)`, `animeKeys.key('watch-history', request)` and
 * `animeKeys.key('anime-watch-history', request)`; `animeKeys.all` is their common
 * prefix.
 */
export const animeKeys = defineQueryKeys('anime');

/** Key of the catalog list, shared by the Catalog page and the History status/type filters. */
export const ANIME_LIST_KEY = animeKeys.key('list');

/**
 * Keys of the Devices page's reads, served by the `api`, `devices` and `sync`
 * modules: `devicesKeys.key('effective-address')`, `devicesKeys.key('pairing-token')`,
 * `devicesKeys.key('connected')` and `devicesKeys.key('syncing-anime', refreshToken)`;
 * `devicesKeys.all` is their common prefix.
 */
export const devicesKeys = defineQueryKeys('devices');

/** Key of the live pairing token; a consumed token invalidates it (`BRIDGE_INVALIDATIONS`). */
export const DEVICES_PAIRING_TOKEN_KEY = devicesKeys.key('pairing-token');

/** Key of the paired-device list; a pairing or a device acknowledgment invalidates it (`BRIDGE_INVALIDATIONS`). */
export const DEVICES_CONNECTED_KEY = devicesKeys.key('connected');

/**
 * Keys of the Activity screen's reads, served by the `observability` module:
 * `activityKeys.key('feed', query)`, `activityKeys.key('overview', ...inputs)` and
 * one by-id read per detail, `activityKeys.key(<read>, id)`; `activityKeys.all` is
 * their common prefix.
 */
export const activityKeys = defineQueryKeys('activity');

/**
 * Keys of the backup module's reads: `backupKeys.key('sqlite-status')`, the rail
 * chip's database ping; `backupKeys.all` is their common prefix.
 */
export const backupKeys = defineQueryKeys('backup');

/**
 * Keys of the settings module's reads (Settings page): `settingsKeys.key('library-root')`
 * and `settingsKeys.key('auto-start')`; `settingsKeys.all` is their common prefix.
 */
export const settingsKeys = defineQueryKeys('settings');

/**
 * Keys of the notifications module's reads: `notificationsKeys.key('unread-count')`
 * (the rail badge and the center header), `notificationsKeys.key('list', filters)`
 * (the center's first page) and `notificationsKeys.key('detail', id)` (the open
 * record); `notificationsKeys.all` is their common prefix.
 */
export const notificationsKeys = defineQueryKeys('notifications');

/** Key of the unread count; an archive invalidates it (`BRIDGE_INVALIDATIONS`). */
export const NOTIFICATIONS_UNREAD_COUNT_KEY = notificationsKeys.key('unread-count');

/** Keys of the season module's reads; `seasonKeys.all` is their common prefix. */
export const seasonKeys = defineQueryKeys('season');
