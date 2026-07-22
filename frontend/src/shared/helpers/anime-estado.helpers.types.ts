/**
 * Minimal read-only shape needed by estado helpers that operate on any
 * record carrying `status` and `active`. Lives in its own types file so the
 * helpers module stays free of inline interfaces per the strict-colocation
 * rule.
 */
export interface AnimeEstadoStatus {
  readonly status: number;
  readonly active: number;
}
