import { Alert, Button, Card, Chip, Label, ListBox, Modal, Select, Table } from '@heroui/react';
import { AnimeDesktopActions } from '../../../../shared/ui/AnimeDesktopActions';
import {
  CONSIDERATION_OPTIONS,
  MAX_GRADE,
  MIN_GRADE,
  SELECTION_EMPTY_MESSAGE,
} from './selection-board.constants';
import { formatSelectionConfirmedLabel, getConsiderationLabel, getVerdictLabel } from './selection-board.helpers';
import { useSelectionBoard } from './use-selection-board';

/**
 * SelectionBoard is the native replacement for the 10-year selection Excel: a
 * decision header (minimum approval grade + slots steppers, live quota meter) over
 * a data table of created candidates whose verdicts derive live, and a confirm
 * action that reconciles the verdicts into anime writes. All Wails I/O, state, and
 * derivation live in the colocated `useSelectionBoard` hook and pure helpers.
 */
export function SelectionBoard() {
  const {
    readOnly,
    minApprovalGrade,
    slots,
    rows,
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
  } = useSelectionBoard();

  let quotaColor: 'danger' | 'warning' | 'success' = 'success';

  if (quota === 'over') {
    quotaColor = 'danger';
  } else if (quota === 'at') {
    quotaColor = 'warning';
  }

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

            <Chip color={quotaColor} variant="soft">
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

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{SELECTION_EMPTY_MESSAGE}</p>
      ) : (
        <Table aria-label="Season selection" variant="secondary">
          <Table.ScrollContainer>
            <Table.Content aria-label="Season selection" className="w-full table-fixed">
              <Table.Header>
                <Table.Column isRowHeader>Name</Table.Column>
                <Table.Column className="w-[100px]">Grade</Table.Column>
                <Table.Column className="w-[220px]">Consideration</Table.Column>
                <Table.Column className="w-[120px]">Verdict</Table.Column>
                <Table.Column className="w-[100px]">Actions</Table.Column>
              </Table.Header>
              <Table.Body>
                {rows.map((row) => (
                  <Table.Row id={row.id} key={row.id}>
                    <Table.Cell>{row.rawName}</Table.Cell>
                    <Table.Cell>{row.grade >= 1 ? row.grade : '—'}</Table.Cell>
                    <Table.Cell>
                      {readOnly ? (
                        <span className="text-sm text-foreground">{getConsiderationLabel(row.consideration)}</span>
                      ) : (
                        <Select
                          aria-label={`Consideration for ${row.rawName}`}
                          value={row.consideration}
                          onChange={(value) => onSetConsideration(row.id, value?.toString() ?? 'none')}
                        >
                          <Label className="sr-only">Consideration</Label>
                          <Select.Trigger>
                            <Select.Value>{getConsiderationLabel(row.consideration)}</Select.Value>
                            <Select.Indicator />
                          </Select.Trigger>
                          <Select.Popover>
                            <ListBox>
                              {CONSIDERATION_OPTIONS.map((option) => (
                                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                                  {option.label}
                                  <ListBox.ItemIndicator />
                                </ListBox.Item>
                              ))}
                            </ListBox>
                          </Select.Popover>
                        </Select>
                      )}
                    </Table.Cell>
                    <Table.Cell>
                      <Chip color={row.verdict === 'approved' ? 'success' : 'default'} size="sm" variant="soft">
                        {getVerdictLabel(row.verdict)}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      <div className="flex items-center gap-2">
                        <AnimeDesktopActions
                          animeId={row.animeId}
                          name={row.rawName}
                          hasPage={row.hasPage}
                          hasFolder={row.hasFolder}
                          pageUrl={row.pageUrl}
                          folderPath={row.folderPath}
                          onOpenPage={onOpenPage}
                          onCopyPage={onCopyPage}
                          onOpenFolder={onOpenFolder}
                          onCopyFolder={onCopyFolder}
                        />
                      </div>
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      )}
    </section>
  );
}
