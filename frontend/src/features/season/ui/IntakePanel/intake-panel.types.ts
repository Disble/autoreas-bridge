import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';

/** The two intake editing modes: plain-text draft vs rendered rows. */
export type IntakeMode = 'raw' | 'list';

/** Semantic HeroUI chip colors used by the intake status chips. */
export type IntakeChipColor = 'success' | 'warning' | 'danger' | 'default';

/** Props for a single editable intake row in List mode. */
export interface IntakeRowProps {
  readonly row: SeasonAnimeRow;
  readonly readOnly: boolean;
  readonly isSelected: boolean;
  readonly folderOverride: string | undefined;
  readonly folderPreview: string | undefined;
  readonly onToggleSelect: () => void;
  readonly onPickFolder: () => void;
  readonly onDiscard: () => void;
  readonly onResolve: (pageUrl: string) => void;
  readonly onOpenPage: (pageUrl: string) => void;
}

/** Props for the trailing action cluster (link, folder, discard, indicator) of an intake row. */
export interface IntakeRowActionsProps {
  readonly row: SeasonAnimeRow;
  readonly readOnly: boolean;
  readonly creatable: boolean;
  readonly folderOverride: string | undefined;
  readonly folderPreview: string | undefined;
  readonly onPickFolder: () => void;
  readonly onDiscard: () => void;
  readonly onOpenPage: (pageUrl: string) => void;
}
