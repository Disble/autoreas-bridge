import type { SeasonAnimeRow, SeasonCreateMetadata, SeasonSource } from '../../../../shared/contracts/season.types';

/** One intake command and its banner and refresh policy. */
export interface IntakeCommand {
  /** Command to invoke. */
  readonly execute: () => Promise<string>;
  /** Message used when a command fails without a message. */
  readonly fallback: string;
  /** Optional shared busy message. */
  readonly busy?: string;
  /** Matching runs refresh only when no run started. */
  readonly matching?: boolean;
}

/** Commands consumed by the intake callbacks. */
export interface IntakeCommands {
  /** Reconciles the raw draft. */
  readonly reconcileIntake: (source: SeasonSource, raw: string) => Promise<void>;
  /** Starts matching. */
  readonly runMatching: (source: SeasonSource) => Promise<void>;
  /** Resolves a row to a page. */
  readonly resolveMatch: (source: SeasonSource, id: string, url: string) => Promise<void>;
  /** Discards one row. */
  readonly discardName: (source: SeasonSource, id: string) => Promise<boolean>;
  /** Restores a discarded row. */
  readonly restoreName: (source: SeasonSource, id: string) => Promise<boolean>;
  /** Saves a row's metadata. */
  readonly setSeasonAnimeMetadata: (source: SeasonSource, id: string, json: string) => Promise<void>;
  /** Creates selected animes. */
  readonly createSeasonAnimes: (source: SeasonSource, ids: readonly string[], folders: Readonly<Record<string, string>>, metadata: Readonly<Record<string, SeasonCreateMetadata>>) => Promise<void>;
  /** Rechecks episode availability. */
  readonly recheckAvailability: (source: SeasonSource) => Promise<void>;
}

/** Rows used to identify a discarded item before the command runs. */
export type IntakeCommandRows = readonly SeasonAnimeRow[];
