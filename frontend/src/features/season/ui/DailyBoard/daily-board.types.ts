import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type { BridgeRuntimeSource } from '../../../../infrastructure/bridge-runtime-source/bridge-runtime-source.types';

/**
 * Created season animes grouped by their live Estrenos section — the conveyor:
 * Sin ver (pick today) → Ver hoy (watching, drains automatically) → Visto.
 */
export interface BoardSections {
  readonly sinVer: readonly SeasonAnimeRow[];
  readonly verHoy: readonly SeasonAnimeRow[];
  readonly visto: readonly SeasonAnimeRow[];
}

/**
 * The cover-resolution port the board depends on: the `getAnimeCover` slice of
 * `BridgeRuntimeSource`, so a test injects a fake without the Wails singleton.
 * Optional because a non-Wails context has no binding, which degrades every
 * row to the placeholder instead of throwing.
 */
export type DailyBoardCoverSource = Pick<BridgeRuntimeSource, 'getAnimeCover'>;

/** One cover-binding answer: a base64 data URL, or the explicit placeholder signal. */
export interface DailyBoardCoverResult {
  readonly source: string;
  readonly dataUrl?: string;
}
