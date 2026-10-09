import { Alert, Button, Card, Chip, Modal } from '@heroui/react';
import seasonAirisArtwork from '../../../../assets/airis-empty-states/season.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { MAX_GRADE, MIN_GRADE, SELECTION_EMPTY_ACTION_LABEL, SELECTION_EMPTY_DESCRIPTION, SELECTION_EMPTY_TITLE } from './selection-board.constants';
import { formatSelectionConfirmedLabel, getQuotaColor } from './selection-board.helpers';
import { SelectionCandidateRow } from './SelectionCandidateRow';
import { useSelectionBoard } from './use-selection-board';
import type { SelectionBoardProps } from './selection-board.types';

/**
 * SelectionBoard is the native replacement for the 10-year selection Excel: a
 * decision header (minimum approval grade + slots steppers, live quota meter) over
 * the created candidates, grouped as Approved then Rejected by their live verdict,
 * and a confirm action that reconciles the verdicts into anime writes. All Wails
 * I/O, state, and derivation live in the colocated `useSelectionBoard` hook and
 * pure helpers.
 */
export function SelectionBoard({ onNavigate }: Readonly<SelectionBoardProps>) {
  const {
    readOnly,
    minApprovalGrade,
    slots,
    rows,
    groups,
    approvedCount,
    quota,
    selectionConfirmedAt,
    errorMessage,
    onSetMinApprovalGrade,
    onSetSlots,
    onSetConsideration,
    onConfirm,
    onOpenPage,
    onCopyPage,
    onOpenFolder,
    onCopyFolder,
    getCoverThumb,
  } = useSelectionBoard();

  const rejectedCount = rows.length - approvedCount;

  return (
    <section className="flex flex-col gap-4">
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Card>
        <Card.Content>
          <div className="flex flex-wrap items-end gap-6">
            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Minimum approval grade</span>
              <div className="flex items-center gap-2">
                <Button
                  aria-label="Decrease minimum approval grade"
                  isDisabled={minApprovalGrade <= MIN_GRADE || readOnly}
                  size="sm"
                  variant="secondary"
                  onPress={() => onSetMinApprovalGrade(minApprovalGrade - 1)}
                >
                  −
                </Button>
                <span className="w-6 text-center text-sm font-semibold text-foreground">{minApprovalGrade}</span>
                <Button
                  aria-label="Increase minimum approval grade"
                  isDisabled={minApprovalGrade >= MAX_GRADE || readOnly}
                  size="sm"
                  variant="secondary"
                  onPress={() => onSetMinApprovalGrade(minApprovalGrade + 1)}
                >
                  +
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-xs text-muted">Slots</span>
              <div className="flex items-center gap-2">
                <Button
                  aria-label="Decrease slots"
                  isDisabled={slots <= 1 || readOnly}
                  size="sm"
                  variant="secondary"
                  onPress={() => onSetSlots(slots - 1)}
                >
                  −
                </Button>
                <span className="w-6 text-center text-sm font-semibold text-foreground">{slots}</span>
                <Button aria-label="Increase slots" isDisabled={readOnly} size="sm" variant="secondary" onPress={() => onSetSlots(slots + 1)}>
                  +
                </Button>
              </div>
            </div>

            <Chip color={getQuotaColor(quota)} variant="soft">
              {approvedCount} / {slots} approved
            </Chip>

            <Chip color={selectionConfirmedAt ? 'success' : 'default'} variant="soft">
              {formatSelectionConfirmedLabel(selectionConfirmedAt)}
            </Chip>

            {!readOnly && (
              <div className="ml-auto">
                <Modal>
                  <Button isDisabled={rows.length === 0} variant="primary">
                    Confirm selection
                  </Button>
                  <Modal.Backdrop variant="blur">
                    <Modal.Container>
                      <Modal.Dialog className="sm:max-w-[440px]">
                        <Modal.CloseTrigger />
                        <Modal.Header>
                          <Modal.Heading>Confirm selection</Modal.Heading>
                        </Modal.Header>
                        <Modal.Body>
                          <p className="text-sm text-foreground">
                            {approvedCount} approved · {rejectedCount} rejected. Rejected animes become “No me gusto” and are
                            deactivated; re-approved animes are restored. Soft delete only — reversible while the season is open.
                          </p>
                          {quota === 'over' && (
                            <p className="mt-2 text-sm text-danger">
                              Over quota ({approvedCount} / {slots}). Resolve with “Insufficient quota” before confirming.
                            </p>
                          )}
                          <Button className="mt-4" slot="close" variant="primary" onPress={() => void onConfirm()}>
                            Apply reconciliation
                          </Button>
                        </Modal.Body>
                      </Modal.Dialog>
                    </Modal.Container>
                  </Modal.Backdrop>
                </Modal>
              </div>
            )}
          </div>
        </Card.Content>
      </Card>

      {rows.length === 0 && errorMessage === undefined ? (
        <AirisEmptyState
          action={{ label: SELECTION_EMPTY_ACTION_LABEL, onPress: () => onNavigate('evaluation') }}
          description={SELECTION_EMPTY_DESCRIPTION}
          imageSrc={seasonAirisArtwork}
          title={SELECTION_EMPTY_TITLE}
        />
      ) : rows.length > 0 ? (
        <Card aria-label="Selection candidates" role="region">
          <Card.Content className="flex flex-col gap-2">
            {groups.map((group) => (
              <div key={group.verdict} className="flex flex-col">
                <p className="px-1 pt-1 text-xs font-semibold text-muted" id={`selection-group-${group.verdict}`}>
                  {group.label} · {group.rows.length}
                </p>
                <ul aria-labelledby={`selection-group-${group.verdict}`} className="flex flex-col divide-y divide-separator">
                  {group.rows.map((row) => (
                    <SelectionCandidateRow
                      key={row.id}
                      coverThumb={getCoverThumb(row.animeId)}
                      readOnly={readOnly}
                      row={row}
                      onCopyFolder={onCopyFolder}
                      onCopyPage={onCopyPage}
                      onOpenFolder={onOpenFolder}
                      onOpenPage={onOpenPage}
                      onSetConsideration={onSetConsideration}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </Card.Content>
        </Card>
      ) : null}
    </section>
  );
}
