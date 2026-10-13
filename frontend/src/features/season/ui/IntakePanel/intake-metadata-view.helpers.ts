import type { SeasonAnimeRow } from '../../../../infrastructure/season-source/season-source.types';
import type { AppliedMetadata } from '../../../../shared/metadata-lookup/metadata-lookup.types';
import { toHeldMetadataPatch } from './intake-panel.helpers';
import type { IntakeAppliedMetadata, IntakeMetadataPatch } from './intake-panel.types';

/**
 * Builds one row's stored-metadata record from the editable rows: what each
 * row STORED from an earlier lookup, so a confirmed choice survives leaving the
 * Season screen or reopening the app. It is the fallback under the session's
 * own patch: a lookup confirmed now wins over what was stored, and a row that
 * never had one contributes nothing. Pure so the metadata-view hook stays a
 * thin memo over it.
 * @param rows The editable intake rows.
 * @returns Row id -> display patch, for the rows that hold stored metadata.
 */
export function buildStoredMetadataByRow(rows: readonly SeasonAnimeRow[]): Record<string, IntakeMetadataPatch> {
  const out: Record<string, IntakeMetadataPatch> = {};
  for (const row of rows) {
    const held = toHeldMetadataPatch(row.metadata);
    if (held !== undefined) {
      out[row.id] = held;
    }
  }
  return out;
}

/**
 * Summarises one row's applied metadata for the row's chip: a row whose
 * metadata came from STORAGE has no session pre-image, so it shows the applied
 * summary without an Undo (the clear action is how it goes away). A row that
 * holds no values has nothing to summarise: an applied record here would keep
 * showing a chip for metadata the user just undid. Pure so the metadata-view
 * hook stays a thin memo over it.
 * @param visibleMetadataByRow The held values of the rows still on screen.
 * @param visibleAppliedMetadataByRow This session's applied records, narrowed likewise.
 * @returns Row id -> applied summary, for the rows that still hold values.
 */
export function buildAppliedMetadataView(
  visibleMetadataByRow: Readonly<Record<string, IntakeMetadataPatch>>,
  visibleAppliedMetadataByRow: Readonly<Record<string, AppliedMetadata<IntakeMetadataPatch>>>,
): Record<string, IntakeAppliedMetadata> {
  const out: Record<string, IntakeAppliedMetadata> = {};
  for (const [rowId, patch] of Object.entries(visibleMetadataByRow)) {
    // A row that holds no values has nothing to summarise: an applied record
    // here would keep showing a chip for metadata the user just undid.
    if (Object.keys(patch).length === 0) {
      continue;
    }
    const session = visibleAppliedMetadataByRow[rowId];
    out[rowId] =
      session === undefined
        ? {
            patch,
            previous: {},
            appliedFields: Object.keys(patch) as (keyof IntakeMetadataPatch)[],
            unfilled: [],
            canUndo: false,
          }
        : { ...session, canUndo: true };
  }
  return out;
}
