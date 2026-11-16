/**
 * Every module the composition root registers, in startup order
 * (`internal/desktop/app_readiness.go`, `registeredModules`). A Vitest test
 * (`infrastructure/readiness`) fails when this list drifts from
 * `internal/lifecycle/modules.json`, which a Go test pins to `registeredModules`.
 */
export const MODULE_IDS = [
  'backup',
  'observability',
  'sync',
  'devices',
  'settings',
  'anime',
  'episodes',
  'api',
  'season',
  'downloads',
  'notifications',
] as const;
