import type { IconifyIcon } from '@iconify/types';

/**
 * Props for the reusable anime desktop-actions pair: an "open page" and an
 * "open folder" icon button, both supporting a secondary click to copy the
 * underlying path/URL instead of opening it. Shared by the Episodes card and
 * the Selection board so neither call site duplicates the pairing/hiding
 * logic. Both buttons hide when their `has*` flag is false.
 */
export interface AnimeDesktopActionsProps {
  /** The anime id passed through to every callback. */
  readonly animeId: string;
  /** Display name used in the buttons' accessible labels. */
  readonly name: string;
  /** Whether the page button renders at all. */
  readonly hasPage: boolean;
  /** Whether the folder button renders at all. */
  readonly hasFolder: boolean;
  /** The real page URL, shown in the page button's tooltip. */
  readonly pageUrl: string;
  /** The real folder path, shown in the folder button's tooltip. */
  readonly folderPath: string;
  /** Opens the anime's source page. */
  readonly onOpenPage: (animeId: string) => void | Promise<void>;
  /** Copies the anime's source page URL to the clipboard. */
  readonly onCopyPage: (animeId: string) => void | Promise<void>;
  /** Opens the anime's download folder. */
  readonly onOpenFolder: (animeId: string) => void | Promise<void>;
  /** Copies the anime's download folder path to the clipboard. */
  readonly onCopyFolder: (animeId: string) => void | Promise<void>;
  /** Overrides the page button icon. Defaults to solar link-round-bold-duotone. */
  readonly pageIcon?: IconifyIcon;
  /** Overrides the folder button icon. Defaults to solar folder-open-bold-duotone. */
  readonly folderIcon?: IconifyIcon;
}
