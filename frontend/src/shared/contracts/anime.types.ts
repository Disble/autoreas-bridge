/**
 * Anime is the shared DTO exposed by the runtime for a single anime in the
 * local catalog. It includes both active and inactive animes.
 */
export interface Anime {
  readonly id: string;
  readonly nombre: string;
  readonly estado: number;
  readonly nrocapvisto: number;
  readonly totalcap?: number;
  readonly activo: number;
  readonly tipo?: number;
  readonly dias: readonly string[];
  readonly generos: readonly string[];
  /** True when the legacy `pagina` (download source page) field is present and non-empty. */
  readonly hasDownloadPage: boolean;
  /** True when the legacy `carpeta` (download destination folder) field is present and non-empty. */
  readonly hasFolder: boolean;
}

/** Status values returned by the manual bridge<-legacy anime pull. */
export type AnimeLegacyPullStatus = 'ok' | 'error' | 'in_progress';

/** Result returned by the manual bridge<-legacy anime pull. */
export interface AnimeLegacyPullResult {
  readonly status: AnimeLegacyPullStatus;
  readonly message: string;
  readonly updatedCount: number;
  readonly prunedCount: number;
  readonly warningCount: number;
}
