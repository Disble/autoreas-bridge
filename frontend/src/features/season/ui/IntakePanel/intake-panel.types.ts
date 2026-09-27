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
  /** This row's held metadata from its last confirmed lookup, absent until then. */
  readonly appliedMetadata: AppliedMetadata<IntakeMetadataPatch> | undefined;
  /** The two Wails-bound MyAnimeList calls this row's lookup modal drives. */
  readonly metadataLookupSource: AnimeMetadataLookupSource;
  /** Attaches one confirmed lookup's selection to this row. */
  readonly onMetadataApplied: (selection: AnimeMetadataSelection) => void;
  /** Reverts this row's last applied metadata patch. */
  readonly onMetadataUndo: () => void;
  readonly onToggleSelect: () => void;
  readonly onPickFolder: () => void;
  readonly onDiscard: () => void;
  readonly onResolve: (pageUrl: string) => void;
  readonly onOpenPage: (pageUrl: string) => void;
}

/** Props for one intake row's own MyAnimeList lookup and whatever it attached. */
export interface IntakeRowMetadataProps {
  /** The row's raw name, the only query this lookup may send. */
  readonly rawName: string;
  /** True while the season is read-only; the lookup then renders nothing at all. */
  readonly readOnly: boolean;
  /** This row's held metadata from its last confirmed lookup, absent until then. */
  readonly appliedMetadata: AppliedMetadata<IntakeMetadataPatch> | undefined;
  /** The two Wails-bound MyAnimeList calls this row's lookup modal drives. */
  readonly metadataLookupSource: AnimeMetadataLookupSource;
  /** Attaches one confirmed lookup's selection to this row. */
  readonly onMetadataApplied: (selection: AnimeMetadataSelection) => void;
  /** Reverts this row's last applied metadata patch. */
  readonly onMetadataUndo: () => void;
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
