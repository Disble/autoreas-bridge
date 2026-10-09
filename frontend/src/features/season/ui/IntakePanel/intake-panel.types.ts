import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type {
  AnimeMetadataSelection,
  AppliedMetadata,
} from '../../../../shared/metadata-lookup/metadata-lookup.types';
import type { AnimeMetadataLookupSource } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/use-anime-metadata-lookup';

/** The two intake editing modes: plain-text draft vs rendered rows. */
export type IntakeMode = 'raw' | 'list';

/** Semantic HeroUI chip colors used by the intake status chips. */
export type IntakeChipColor = 'success' | 'warning' | 'danger' | 'default';

/**
 * The metadata ONE confirmed MyAnimeList lookup attaches to ONE intake row,
 * held in the hook for the session only. Every member is written by the
 * allow-list mapper in `intake-panel.helpers.ts`; the intake row's protected
 * fields -- download page, download folder, watched episodes, estado and the
 * first-watch date -- have no member here, so no mapping can reach them. No
 * part of this slice persists this value or sends it to creation: it exists so
 * the user can see what the row's lookup attached before a later P5b/P5c work
 * unit consumes it.
 */
export interface IntakeMetadataPatch {
  readonly name?: string;
  readonly kind?: string;
  readonly totalEpisodes?: string;
  readonly duration?: string;
  readonly origin?: string;
  readonly genres?: string;
  readonly studios?: string;
  readonly coverURL?: string;
}

/** Props for a single editable intake row in List mode. */
export interface IntakeRowProps {
  readonly row: SeasonAnimeRow;
  readonly readOnly: boolean;
  readonly isSelected: boolean;
  readonly folderOverride: string | undefined;
  readonly folderPreview: string | undefined;
  /** The values this row currently holds, from a session lookup or from storage. */
  readonly heldMetadata: IntakeMetadataPatch | undefined;
  /** This row's applied record, absent when it holds nothing. */
  readonly appliedMetadata: IntakeAppliedMetadata | undefined;
  /** The two Wails-bound MyAnimeList calls this row's lookup modal drives. */
  readonly metadataLookupSource: AnimeMetadataLookupSource;
  /** Attaches one confirmed lookup's selection to this row. */
  readonly onMetadataApplied: (selection: AnimeMetadataSelection) => void;
  /** Reverts this row's last applied metadata patch, when this session applied it. */
  readonly onMetadataUndo: () => void;
  /** Removes this row's metadata, stored and local, when the choice was wrong. */
  readonly onMetadataClear: () => void;
  readonly onToggleSelect: () => void;
  readonly onPickFolder: () => void;
  readonly onDiscard: () => void;
  readonly onResolve: (pageUrl: string) => void;
  readonly onOpenPage: (pageUrl: string) => void;
}

/** A row's applied metadata plus whether THIS session holds the undo pre-image. */
export interface IntakeAppliedMetadata extends AppliedMetadata<IntakeMetadataPatch> {
  /**
   * True only when this session applied the patch, so it also holds the pre-image
   * Undo replays. A record that came from storage has no pre-image: the way to
   * remove it is the clear action.
   */
  readonly canUndo: boolean;
}

/** Props for the muted lines under an intake row's name. */
export interface IntakeRowHintsProps {
  readonly row: SeasonAnimeRow;
  /** Whether the row can be created yet; its episode count is hinted only then. */
  readonly creatable: boolean;
  /** The values this row currently holds, summarized in one line when present. */
  readonly heldMetadata: IntakeMetadataPatch | undefined;
}

/**
 * Props for the trailing action group of an intake row: metadata lookup, page,
 * folder, the more-actions menu, and the availability dot.
 */
export interface IntakeRowActionsProps
  extends Omit<IntakeRowProps, 'isSelected' | 'heldMetadata' | 'onToggleSelect' | 'onResolve'> {
  /** Whether the row can be created yet; only then can its folder be picked. */
  readonly creatable: boolean;
}

/** Props for an intake row's download-folder picker button. */
export interface IntakeRowFolderButtonProps {
  /** The row's raw name, which names the button. */
  readonly rawName: string;
  /** The download folder this row overrides, absent when it inherits the default. */
  readonly folderOverride: string | undefined;
  /** The folder creation will use, shown as the tooltip; absent when none resolves. */
  readonly folderPreview: string | undefined;
  /** Opens the native folder picker for this row. */
  readonly onPickFolder: () => void;
}

/** Props for a matched intake row's availability dot. */
export interface IntakeRowAvailabilityDotProps {
  readonly row: SeasonAnimeRow;
}

/** Props for an intake row's "More actions" menu. */
export interface IntakeRowMoreMenuProps {
  /** The row's raw name, which names the menu trigger. */
  readonly rawName: string;
  /** This row's applied record; Undo and Clear are offered only while it exists. */
  readonly appliedMetadata: IntakeAppliedMetadata | undefined;
  /** Reverts this row's last applied metadata patch. */
  readonly onMetadataUndo: () => void;
  /** Removes this row's metadata, stored and local. */
  readonly onMetadataClear: () => void;
  /** Discards the row's name from the intake list. */
  readonly onDiscard: () => void;
}

/**
 * Props for the intake card body: the raw textarea, the empty state, or the row
 * list, chosen from the mode and the rows. Every per-row callback takes the row id
 * so the body binds it to each row.
 */
export interface IntakePanelBodyProps {
  readonly mode: IntakeMode;
  readonly readOnly: boolean;
  readonly rawDraft: string;
  readonly editableRows: readonly SeasonAnimeRow[];
  /** The load/action error; with it present the empty state is withheld. */
  readonly errorMessage: string | undefined;
  readonly selected: ReadonlySet<string>;
  readonly folderOverrides: Readonly<Record<string, string | undefined>>;
  readonly folderPreviews: Readonly<Record<string, string | undefined>>;
  readonly metadataByRow: Readonly<Record<string, IntakeMetadataPatch | undefined>>;
  readonly appliedMetadataByRow: Readonly<Record<string, IntakeAppliedMetadata | undefined>>;
  readonly metadataLookupSource: AnimeMetadataLookupSource;
  /** Switches between Raw and List; the empty state's action opens Raw. */
  readonly switchMode: (mode: IntakeMode) => void;
  readonly onRawChange: (value: string) => void;
  readonly toggleSelect: (rowId: string) => void;
  readonly onPickFolder: (rowId: string) => void;
  readonly onDiscard: (rowId: string) => void;
  readonly onResolve: (rowId: string, pageUrl: string) => void;
  readonly onOpenPage: (pageUrl: string) => void;
  readonly onMetadataApplied: (rowId: string, selection: AnimeMetadataSelection) => void;
  readonly onMetadataUndo: (rowId: string) => void;
  readonly onMetadataClear: (rowId: string) => void;
}
