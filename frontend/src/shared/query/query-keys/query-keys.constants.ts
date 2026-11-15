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
