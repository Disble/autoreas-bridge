import { Button, Chip, Typography } from '@heroui/react';
import { AnimeMetadataLookupModal } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/AnimeMetadataLookupModal';
import { formatMetadataValues } from './intake-panel.helpers';
import type { IntakeRowMetadataProps } from './intake-panel.types';

/**
 * IntakeRowMetadata is one intake row's own MyAnimeList lookup: the modal trigger
 * for that row's name, the VALUES a confirmed lookup attached (episodes, duration,
 * origin, genres, studios, cover), and the two ways to take it back — Undo for a
 * change made in this session, Clear for a choice that was simply wrong.
 *
 * It is deliberately not an editor: the user confirms in the modal and reads the
 * result here, and any correction happens once the anime exists. No other row's
 * name can reach the modal, only a confirmed candidate is fetched, and it renders
 * nothing while the season is read-only. Purely presentational: every callback
 * comes from the panel through the row.
 */
export function IntakeRowMetadata({
  rawName,
  readOnly,
  heldMetadata,
  appliedMetadata,
  metadataLookupSource,
  onMetadataApplied,
  onMetadataUndo,
  onMetadataClear,
}: Readonly<IntakeRowMetadataProps>) {
  if (readOnly) {
    return null;
  }
  const values = heldMetadata === undefined ? [] : formatMetadataValues(heldMetadata);
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <AnimeMetadataLookupModal name={rawName} source={metadataLookupSource} onConfirm={onMetadataApplied} />
      {appliedMetadata === undefined ? null : (
        <>
          <Chip color="success" size="sm" variant="soft">
            Applied: {values.length} field{values.length === 1 ? '' : 's'}
          </Chip>
          {appliedMetadata.canUndo ? (
            <Button size="sm" variant="tertiary" onPress={onMetadataUndo}>
              Undo autofill
            </Button>
          ) : null}
          <Button size="sm" variant="tertiary" onPress={onMetadataClear}>
            Clear metadata
          </Button>
          {appliedMetadata.unfilled.length === 0 ? null : (
            <Typography color="muted" type="body-xs">
              MyAnimeList did not provide: {appliedMetadata.unfilled.join(', ')}
            </Typography>
          )}
          {values.length === 0 ? null : (
            <ul className="flex w-full flex-wrap gap-x-4 gap-y-1 text-xs text-muted" data-testid="intake-metadata-values">
              {values.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
