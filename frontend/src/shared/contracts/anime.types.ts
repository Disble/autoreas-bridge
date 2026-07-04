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

/** A single repetition-history entry from the legacy `repetir` timeline. */
export interface AnimeRepeticion {
  readonly numrepeticion: number;
  readonly nrocapvisto: number;
  readonly estado: number;
  readonly fechaCreacion?: number;
  readonly fechaEstreno?: number;
  readonly fechaUltCapVisto?: number;
  readonly fechaEliminacion?: number;
  readonly fechaRepeticion?: number;
}

/** A single scheduled-day entry (`dias`) on an anime detail record. */
export interface AnimeDetailDay {
  readonly dia: string;
  readonly orden: number;
}

/**
 * AnimeDetail is the rich, read-only detail DTO returned by `GetAnimeDetail`.
 * Deliberately standalone rather than a superset of `Anime`: `Anime`'s slim
 * `hasDownloadPage`/`hasFolder` booleans are a different shape than the
 * detail's raw `pagina`/`carpeta` string-or-undefined fields, so extending
 * `Anime` would fight that mismatch (design.md "Open assumptions").
 *
 * `repetir` is optional (not just empty-array) because the Go contract omits
 * it from the wire payload via `omitempty` even for a non-nil empty slice
 * (encoding/json's `omitempty` treats zero-length slices as empty) -- the
 * vast majority of anime have no repetition history, so callers must treat a
 * missing `repetir` the same as an empty timeline.
 */
export interface AnimeDetail {
  readonly _id: string;
  readonly nombre: string;
  readonly estado: number;
  readonly nrocapvisto: number;
  readonly totalcap?: number;
  readonly activo: number;
  readonly primeravez: number;
  readonly dias: readonly AnimeDetailDay[];
  readonly generos: readonly string[];
  readonly tipo?: number;
  readonly fechaUltCapVisto?: number;
  readonly fechaEstreno?: number;
  readonly fechaCreacion?: number;
  readonly fechaEliminacion?: number;
  readonly portada?: string;
  readonly pagina?: string;
  readonly carpeta?: string;
  readonly estudios?: string;
  readonly origen?: string;
  readonly duracion?: number;
  readonly repetir?: readonly AnimeRepeticion[];
  readonly modified_at: number;
}

/**
 * AnimeHistoryEntry is a single row of the History read model returned by
 * `GetAnimeHistory` (Anime History spec, "History Read Model"): a
 * watch-activity log entry, server-sorted DESC by `fechaUltCapVisto` and
 * membership-filtered (only animes with a present `fechaUltCapVisto`) --
 * never re-derived or re-sorted on the frontend.
 */
export interface AnimeHistoryEntry {
  readonly id: string;
  readonly nombre: string;
  readonly nrocapvisto: number;
  readonly fechaUltCapVisto: number;
  readonly estado: number;
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
