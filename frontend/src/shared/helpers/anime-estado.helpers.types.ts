/**
 * Minimal read-only shape needed by estado helpers that operate on any
 * record carrying `estado` and `activo`. Lives in its own types file so the
 * helpers module stays free of inline interfaces per the strict-colocation
 * rule.
 */
export interface AnimeEstadoStatus {
  readonly estado: number;
  readonly activo: number;
}
