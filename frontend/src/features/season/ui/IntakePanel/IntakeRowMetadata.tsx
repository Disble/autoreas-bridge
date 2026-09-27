import { Button, Chip, Typography } from '@heroui/react';
import { AnimeMetadataLookupModal } from '../../../../shared/metadata-lookup/ui/AnimeMetadataLookupModal/AnimeMetadataLookupModal';
import { formatAppliedMetadataFields } from './intake-panel.helpers';
import type { IntakeRowMetadataProps } from './intake-panel.types';

/**
 * IntakeRowMetadata is one intake row's own MyAnimeList lookup: the modal trigger
 * for that row's name, and whatever the confirmed lookup attached — the applied
 * field summary, its Undo, and the fields MyAnimeList could not fill. No other
 * row's name can reach this modal, opening or cancelling it fetches no detail
 * page, and the attached metadata lives for the session only. It renders nothing
 * while the season is read-only, so the row never offers an edit it cannot make.
 * Purely presentational: every callback comes from the panel through the row.
 */
export function IntakeRowMetadata({
  rawName,
  readOnly,
  appliedMetadata,
  metadataLookupSource,
  onMetadataApplied,
  onMetadataUndo,
}: Readonly<IntakeRowMetadataProps>) {
  if (readOnly) {
    return null;
  }
  return (
    <div className="flex w-full flex-wrap items-center gap-3">
      <AnimeMetadataLookupModal name={rawName} source={metadataLookupSource} onConfirm={onMetadataApplied} />
      {appliedMetadata === undefined ? null : (
        <>
          <Chip color="success" size="sm" variant="soft">
            Applied: {formatAppliedMetadataFields(appliedMetadata.appliedFields)}
          </Chip>
          <Button size="sm" variant="tertiary" onPress={onMetadataUndo}>
            Undo autofill
          </Button>
          {appliedMetadata.unfilled.length === 0 ? null : (
            <Typography color="muted" type="body-xs">
              MyAnimeList did not provide: {appliedMetadata.unfilled.join(', ')}
            </Typography>
          )}
        </>
      )}
    </div>
  );
}
