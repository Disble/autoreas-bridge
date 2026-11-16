import type { DownloadsSource } from '../../../../../shared/contracts/download.types';

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
  /** The downloads port the shared schedule query reads through. */
  readonly source?: DownloadsSource;
}
