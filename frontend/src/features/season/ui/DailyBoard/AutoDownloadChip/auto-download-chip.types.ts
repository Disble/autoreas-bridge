import type { DownloadRuntimeSource } from '../../../../../infrastructure/download-runtime-source/download-runtime-source.types';

/**
 * What today's scheduled download looks like from the Daily board:
 * - `scheduled`: today is a selected day and its time is still ahead;
 * - `downloading`: a scheduler run is in progress;
 * - `downloaded`: today's run finished with `ok`;
 * - `notCompleted`: today's time passed without an `ok` run (missed or failed);
 * - `noneToday`: today is not one of the selected days;
 * - `off`: scheduled downloads are disabled.
 */
export type AutoDownloadChipKind = 'scheduled' | 'downloading' | 'downloaded' | 'notCompleted' | 'noneToday' | 'off';

/** The chip, ready to render: its state, the short label, and the full sentence for the tooltip. */
export interface AutoDownloadChipView {
  /** Which of today's states this is; it picks the chip's glyph. */
  readonly kind: AutoDownloadChipKind;
  /** The time ("22:00") or a word or two ("Downloading", "No download", "Off"). */
  readonly label: string;
  /** The whole statement the label abbreviates. */
  readonly tooltip: string;
  /** True while something is still ahead or under way today: the chip uses the accent color. */
  readonly isActive: boolean;
}

/** Props of the read-only scheduled-download chip. */
export interface AutoDownloadChipProps {
  /** The Downloads port the shared schedule read-model loads through. */
  readonly source?: DownloadRuntimeSource;
}
