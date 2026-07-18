import { Alert, Button, Card, Label, TextArea, TextField } from '@heroui/react';
import { IntakeRow } from './IntakeRow';
import { INTAKE_EMPTY_MESSAGE, INTAKE_PASTE_PLACEHOLDER } from './intake-panel.constants';
import { useIntakePanel } from './use-intake-panel';

/**
 * IntakePanel is the dual-mode "Intake & Matching" section — everything BEFORE an
 * anime is created. Raw mode edits the uncreated names as plain text (debounced
 * reconcile); List mode shows each name's match + availability, and lets the user
 * PICK the available ones and explicitly Create them (creation is irreversible,
 * so it is never automatic). Created animes leave this view for the Daily Board.
 * All Wails I/O and state live in the colocated `useIntakePanel` hook.
 */
export function IntakePanel() {
  const {
    readOnly,
    mode,
    switchMode,
    rawDraft,
    onRawChange,
    editableRows,
    selected,
    toggleSelect,
    folderOverrides,
    folderPreviews,
    onPickFolder,
    availableCount,
    availabilityPendingCount,
    onCreate,
    unresolvedCount,
    errorMessage,
    busyMessage,
    onRunMatching,
    onRecheckAvailability,
    onResolve,
    onDiscard,
    onOpenPage,
  } = useIntakePanel();

  return (
    <section className="flex flex-col gap-4">
      {busyMessage !== undefined && (
        <output
          aria-live="polite"
          className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground"
        >
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted border-t-accent" />
          {busyMessage}
        </output>
      )}

      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <Card>
        <Card.Content>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Intake list</h3>
            {!readOnly && (
              <div className="flex gap-1">
                <Button size="sm" variant={mode === 'raw' ? 'primary' : 'tertiary'} onPress={() => switchMode('raw')}>
                  Raw
                </Button>
                <Button size="sm" variant={mode === 'list' ? 'primary' : 'tertiary'} onPress={() => switchMode('list')}>
                  List
                </Button>
              </div>
            )}
          </div>

          {mode === 'raw' ? (
            <TextField value={rawDraft} onChange={onRawChange}>
              <Label className="sr-only">Intake names</Label>
              <TextArea placeholder={INTAKE_PASTE_PLACEHOLDER} rows={8} />
            </TextField>
          ) : (
            <ul className="flex flex-col gap-2">
              {editableRows.length === 0 && <li className="text-sm text-muted">{INTAKE_EMPTY_MESSAGE}</li>}
              {editableRows.map((row) => (
                <IntakeRow
                  key={row.id}
                  folderOverride={folderOverrides[row.id]}
                  folderPreview={folderPreviews[row.id]}
                  isSelected={selected.has(row.id)}
                  readOnly={readOnly}
                  row={row}
                  onDiscard={() => onDiscard(row.id)}
                  onOpenPage={onOpenPage}
                  onPickFolder={() => onPickFolder(row.id)}
                  onResolve={(pageUrl) => onResolve(row.id, pageUrl)}
                  onToggleSelect={() => toggleSelect(row.id)}
                />
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!readOnly && (
              <>
                <Button isDisabled={editableRows.length === 0} variant="secondary" onPress={onRunMatching}>
                  Run matching
                </Button>
                <Button isDisabled={availabilityPendingCount === 0} variant="secondary" onPress={onRecheckAvailability}>
                  Check availability
                </Button>
                <Button isDisabled={selected.size === 0} variant="primary" onPress={onCreate}>
                  Create {selected.size > 0 ? selected.size : ''}
                </Button>
              </>
            )}
            <span className="text-sm text-muted">
              {unresolvedCount} unresolved · {availabilityPendingCount} waiting · {availableCount} available to create
            </span>
          </div>
        </Card.Content>
      </Card>
    </section>
  );
}
