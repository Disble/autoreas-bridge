import magicStickIcon from '@iconify-icons/solar/magic-stick-3-bold-duotone';
import { useState } from 'react';
import { LookupModal } from '../../../ui/LookupModal/LookupModal';
import { LookupTrigger } from '../../../ui/LookupModal/LookupTrigger';
import { rankCandidates } from '../../metadata-lookup.helpers';
import type { AnimeMetadataSelection } from '../../metadata-lookup.types';
import { METADATA_LOOKUP_COPY, METADATA_LOOKUP_TRIGGER_LABEL } from './anime-metadata-lookup.constants';
import { AnimeMetadataLookupCandidate } from './AnimeMetadataLookupCandidate';
import type { AnimeMetadataLookupTriggerVariant } from './anime-metadata-lookup.types';
import type { AnimeMetadataLookupSource } from './use-anime-metadata-lookup';
import { useAnimeMetadataLookup } from './use-anime-metadata-lookup';

/** Presentation-only inputs for the MyAnimeList lookup modal. */
export interface AnimeMetadataLookupModalProps {
  /** The row's/form's current Name -- seeds the search field on first open and gates the trigger. */
  readonly name: string;
  /** The two Wails-bound calls this lookup drives, injected so a test can supply a fake. */
  readonly source: AnimeMetadataLookupSource;
  /**
   * Invoked with the confirmed candidate's mapped selection, already
   * translated into bridge vocabulary (design's hop one). The caller
   * performs its own hop-two mapping into its own draft patch -- this modal
   * knows no feature type.
   */
  readonly onConfirm: (selection: AnimeMetadataSelection) => void;
  /** How the trigger renders: the visible text button (default) or a round icon button. */
  readonly triggerVariant?: AnimeMetadataLookupTriggerVariant;
}

/**
 * The "Fetch metadata" action (`anime-metadata-autofill` spec): a trigger
 * disabled while Name is empty opens a modal with its own search field,
 * pre-filled from Name on first open only. The candidate list renders
 * exactly one of three mutually exclusive states (design D8); selecting a
 * candidate only highlights it, and only the primary action fetches its
 * detail page and reports a mapped selection back to the caller. Cancel
 * closes the modal and calls `onConfirm` with nothing.
 */
export function AnimeMetadataLookupModal({
  name,
  source,
  onConfirm,
  triggerVariant = 'text',
}: Readonly<AnimeMetadataLookupModalProps>) {
  const [isOpen, setIsOpen] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const {
    query,
    state,
    candidates,
    errorMessage,
    selectedMalId,
    confirmError,
    onQueryChange,
    onOpenChange,
    onSelectCandidate,
    onConfirmSelection,
  } = useAnimeMetadataLookup(name, source);

  const rankedCandidates = rankCandidates(candidates, query);

  /**
   * Keeps the modal's own open state and the hook's first-open-only seeding
   * in sync, whichever side triggered the change (the trigger button, the
   * Cancel button, or React Aria's own Escape/backdrop dismissal).
   * @param nextIsOpen The Modal's next open state.
   */
  function handleOpenChange(nextIsOpen: boolean): void {
    setIsOpen(nextIsOpen);
    onOpenChange(nextIsOpen);
  }

  /**
   * Fetches the highlighted candidate's detail page and, only once it maps
   * to a selection successfully, reports it to the caller and closes the
   * modal. A failed fetch surfaces `confirmError` and leaves the modal open.
   */
  async function handleConfirm(): Promise<void> {
    setIsConfirming(true);
    const selection = await onConfirmSelection();
    setIsConfirming(false);
    if (selection !== undefined) {
      onConfirm(selection);
      handleOpenChange(false);
    }
  }

  return (
    <LookupModal
      confirmError={confirmError}
      copy={METADATA_LOOKUP_COPY}
      errorMessage={errorMessage}
      hasCandidates={rankedCandidates.length > 0}
      isConfirmDisabled={selectedMalId === null}
      isConfirming={isConfirming}
      isOpen={isOpen}
      query={query}
      state={state}
      trigger={
        <LookupTrigger
          icon={magicStickIcon}
          isDisabled={name === ''}
          label={METADATA_LOOKUP_TRIGGER_LABEL}
          variant={triggerVariant}
        />
      }
      onConfirm={() => void handleConfirm()}
      onOpenChange={handleOpenChange}
      onQueryChange={onQueryChange}
    >
      {rankedCandidates.map((candidate) => (
        <AnimeMetadataLookupCandidate
          candidate={candidate}
          isSelected={candidate.malId === selectedMalId}
          key={candidate.malId}
          onSelect={onSelectCandidate}
        />
      ))}
    </LookupModal>
  );
}
