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
  readonly onQueryChange: (query: string) => void;
  readonly onEstadoChange: (value: string) => void;
  readonly onActivoChange: (value: string) => void;
  readonly onTipoChange: (value: string) => void;
  readonly onDiaChange: (value: string) => void;
  readonly onGenerosChange: (values: readonly (string | number)[]) => void;
}
