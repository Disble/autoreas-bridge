/**
 * Props for the AnimePanel component. The panel is self-contained and reads
 * the anime catalog from the Wails runtime, so it accepts no external data.
 */
export interface AnimePanelProps {
  readonly className?: string;
}

/**
 * Normalized status derived from the backend `activo` flag.
 */
export type AnimeStatus = 'active' | 'inactive';

/**
 * View model consumed by the AnimePanel UI.
 */
export interface AnimeViewModel {
  readonly id: string;
  readonly nombre: string;
  readonly estado: number;
  readonly progressLabel: string;
  readonly status: AnimeStatus;
  readonly statusLabel: string;
  /** Mirrors `Anime.hasDownloadPage` — read-only anime-data-quality signal. */
  readonly hasDownloadPage: boolean;
  /** Mirrors `Anime.hasFolder` — read-only anime-data-quality signal. */
  readonly hasFolder: boolean;
  /** True when either the download page or folder is missing. */
  readonly hasDownloadGap: boolean;
  /** Human-readable summary of what is missing; undefined when there is no gap. */
  readonly gapLabel: string | undefined;
}

/**
 * Single option rendered by a filter select control.
 */
export interface AnimeFilterOption {
  readonly value: string;
  readonly label: string;
}

/**
 * Current values of all filter controls.
 */
export interface AnimeFilterState {
  readonly query: string;
  readonly estado: string;
  readonly activo: string;
  readonly tipo: string;
  readonly dia: string;
  readonly generos: readonly string[];
  /** Download gap filter: `all` | `missing` | `complete` (see ANIME_GAP_* constants). */
  readonly gap: string;
}

/**
 * Props for the dumb AnimeFilterBar component.
 */
export interface AnimeFilterBarProps {
  readonly filters: AnimeFilterState;
  readonly estadoOptions: readonly AnimeFilterOption[];
  readonly activoOptions: readonly AnimeFilterOption[];
  readonly tipoOptions: readonly AnimeFilterOption[];
  readonly diaOptions: readonly AnimeFilterOption[];
  readonly generoOptions: readonly AnimeFilterOption[];
  readonly gapOptions: readonly AnimeFilterOption[];
  readonly onQueryChange: (query: string) => void;
  readonly onEstadoChange: (value: string) => void;
  readonly onActivoChange: (value: string) => void;
  readonly onTipoChange: (value: string) => void;
  readonly onDiaChange: (value: string) => void;
  readonly onGenerosChange: (values: readonly (string | number)[]) => void;
  readonly onGapChange: (value: string) => void;
}
