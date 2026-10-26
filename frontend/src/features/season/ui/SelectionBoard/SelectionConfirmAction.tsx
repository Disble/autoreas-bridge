import { Button, Modal } from '@heroui/react';

/** What the confirm action and its modal need to describe the reconciliation. */
interface SelectionConfirmActionProps {
  /** How many candidates derive as approved. */
  readonly approvedCount: number;
  /** How many candidates derive as rejected. */
  readonly rejectedCount: number;
  /** The current slot cap, for the over-quota warning. */
  readonly slots: number;
  /** Whether the approved count exceeds the slot cap. */
  readonly isOverQuota: boolean;
  /** Applies the reconciliation. */
  readonly onConfirm: () => void;
}

/**
 * SelectionConfirmAction is the decision header's primary action: a Confirm
 * selection button that opens a modal stating how many candidates are approved
 * and rejected, what each verdict becomes, and — only when the quota is over —
 * the blocking warning. It renders only where the season is editable; the
 * caller owns that condition.
 */
export function SelectionConfirmAction({ approvedCount, rejectedCount, slots, isOverQuota, onConfirm }: Readonly<SelectionConfirmActionProps>) {
  return (
    <Modal>
      <Button variant="primary">Confirm selection</Button>
      <Modal.Backdrop variant="blur">
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[440px]">
            <Modal.CloseTrigger />
            <Modal.Header>
              <Modal.Heading>Confirm selection</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-foreground">
                {approvedCount} approved · {rejectedCount} rejected. Rejected animes become “No me gusto” and are deactivated;
                re-approved animes are restored. Soft delete only — reversible while the season is open.
              </p>
              {isOverQuota ? (
                <p className="mt-2 text-sm text-danger">
                  Over quota ({approvedCount} / {slots}). Resolve with “Insufficient quota” before confirming.
                </p>
              ) : null}
              <Button className="mt-4" slot="close" variant="primary" onPress={onConfirm}>
                Apply reconciliation
              </Button>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
