import { Alert, Button, Modal, SearchField } from '@heroui/react';
import { useState } from 'react';
import metadataLookupEmptyArtwork from '../../../../assets/airis-empty-states/catalog.webp';
import { AirisEmptyState } from '../../../ui/AirisEmptyState/AirisEmptyState';
import { rankCandidates } from '../../metadata-lookup.helpers';
import type { AnimeMetadataSelection } from '../../metadata-lookup.types';
import {
  METADATA_LOOKUP_CANCEL_LABEL,
  METADATA_LOOKUP_CONFIRM_LABEL,
  METADATA_LOOKUP_ERROR_TITLE,
  METADATA_LOOKUP_LOADING_LABEL,
  METADATA_LOOKUP_TRIGGER_LABEL,
} from './anime-metadata-lookup.constants';
import { AnimeMetadataLookupCandidate } from './AnimeMetadataLookupCandidate';
import { AnimeMetadataLookupCandidateSkeleton } from './AnimeMetadataLookupCandidateSkeleton';
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
export function AnimeMetadataLookupModal({ name, source, onConfirm }: Readonly<AnimeMetadataLookupModalProps>) {
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
    <Modal isOpen={isOpen} onOpenChange={handleOpenChange}>
      {/* HeroUI's Modal treats this Button as its own trigger and calls
          onOpenChange when it is pressed -- no onPress handler needed here. */}
      <Button isDisabled={name === ''} variant="tertiary">
        {METADATA_LOOKUP_TRIGGER_LABEL}
      </Button>
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.Header>
              <Modal.Heading>{METADATA_LOOKUP_TRIGGER_LABEL}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <SearchField aria-label="Search MyAnimeList" fullWidth onChange={onQueryChange} value={query}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder="Search MyAnimeList..." />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>

              {state === 'loading' ? (
                <div
                  aria-labelledby="metadata-lookup-loading-label"
                  aria-live="polite"
                  className="flex flex-col gap-2"
                  role="status"
                >
                  <span className="sr-only" id="metadata-lookup-loading-label">
                    {METADATA_LOOKUP_LOADING_LABEL}
                  </span>
                  <AnimeMetadataLookupCandidateSkeleton />
                </div>
              ) : null}

              {state === 'failed' ? (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Title>{METADATA_LOOKUP_ERROR_TITLE}</Alert.Title>
                    <Alert.Description>{errorMessage}</Alert.Description>
                  </Alert.Content>
                </Alert>
              ) : null}

              {state === 'resolved' && rankedCandidates.length === 0 ? (
                <AirisEmptyState
                  description="Try a shorter title or a different romanization in the search field above."
                  imageSrc={metadataLookupEmptyArtwork}
                  title={`No MyAnimeList matches for "${query}"`}
                />
              ) : null}

              {state === 'resolved' && rankedCandidates.length > 0 ? (
                <div aria-label="MyAnimeList candidates" className="flex max-h-96 flex-col gap-2 overflow-y-auto pr-1">
                  {rankedCandidates.map((candidate) => (
                    <AnimeMetadataLookupCandidate
                      candidate={candidate}
                      isSelected={candidate.malId === selectedMalId}
                      key={candidate.malId}
                      onSelect={onSelectCandidate}
                    />
                  ))}
                </div>
              ) : null}

              {confirmError === '' ? null : (
                <Alert status="danger">
                  <Alert.Content>
                    <Alert.Title>{METADATA_LOOKUP_ERROR_TITLE}</Alert.Title>
                    <Alert.Description>{confirmError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={() => handleOpenChange(false)}>
                {METADATA_LOOKUP_CANCEL_LABEL}
              </Button>
              <Button
                isDisabled={selectedMalId === null}
                isPending={isConfirming}
                variant="primary"
                onPress={() => void handleConfirm()}
              >
                {METADATA_LOOKUP_CONFIRM_LABEL}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
