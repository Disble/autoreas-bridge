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
}
