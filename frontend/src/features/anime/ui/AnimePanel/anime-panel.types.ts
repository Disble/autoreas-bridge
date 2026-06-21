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
