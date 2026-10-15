import { Button, Modal, SearchField } from '@heroui/react';
import { LookupErrorAlert, LookupModalResults } from './LookupModalResults';
import type { LookupModalProps } from './lookup-modal.types';

/**
 * The shared, presentation-only shell of a search-and-pick lookup: a trigger,
 * a dialog with its own search field, a candidate list that renders exactly
 * one of its mutually exclusive states (loading skeleton, failure alert,
 * filtered empty state, or the caller's rows; design D8), the confirm-error
 * alert, and Cancel plus a primary confirm action. Every lookup owns its own
 * search and selection logic and wording; this shell owns only the markup.
 */
export function LookupModal({
  copy,
  trigger,
  isOpen,
  onOpenChange,
  query,
  onQueryChange,
  state,
  errorMessage,
  hasCandidates,
  children,
  confirmError,
  isConfirmDisabled,
  isConfirming,
  onConfirm,
}: Readonly<LookupModalProps>) {
  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      {/* HeroUI's Modal treats this Button as its own trigger and calls
          onOpenChange when it is pressed -- no onPress handler needed here. */}
      {trigger}
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-lg">
            <Modal.Header>
              <Modal.Heading>{copy.heading}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              <SearchField aria-label={copy.searchLabel} fullWidth onChange={onQueryChange} value={query}>
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder={copy.searchPlaceholder} />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>

              <LookupModalResults
                copy={copy}
                errorMessage={errorMessage}
                hasCandidates={hasCandidates}
                query={query}
                state={state}
              >
                {children}
              </LookupModalResults>

              {confirmError === '' ? null : <LookupErrorAlert message={confirmError} title={copy.errorTitle} />}
            </Modal.Body>
            <Modal.Footer>
              <Button variant="tertiary" onPress={() => onOpenChange(false)}>
                {copy.cancelLabel}
              </Button>
              <Button isDisabled={isConfirmDisabled} isPending={isConfirming} variant="primary" onPress={onConfirm}>
                {copy.confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
