import { Alert, Button, Card } from '@heroui/react';
import { IntakePanelBody } from './IntakePanelBody';
import { useIntakePanel } from './use-intake-panel';

/**
 * IntakePanel is the dual-mode "Intake & Matching" section — everything BEFORE an
 * anime is created. Raw mode edits the uncreated names as plain text (debounced
 * reconcile); List mode shows each name's match + availability, and lets the user
 * PICK the available ones and explicitly Create them (creation is irreversible,
 * so it is never automatic). Footer actions render only while they can act.
 * Created animes leave this view for the Daily Board.
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
    metadataByRow,
    appliedMetadataByRow,
    metadataLookupSource,
    onMetadataApplied,
    onMetadataUndo,
    onMetadataClear,
    availableCount,
    availabilityPendingCount,
    onCreate,
    unresolvedCount,
    searchFailedCount,
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

          <IntakePanelBody
            appliedMetadataByRow={appliedMetadataByRow}
            editableRows={editableRows}
            errorMessage={errorMessage}
            folderOverrides={folderOverrides}
            folderPreviews={folderPreviews}
            metadataByRow={metadataByRow}
            metadataLookupSource={metadataLookupSource}
            mode={mode}
            rawDraft={rawDraft}
            readOnly={readOnly}
            selected={selected}
            switchMode={switchMode}
            toggleSelect={toggleSelect}
            onDiscard={onDiscard}
            onMetadataApplied={onMetadataApplied}
            onMetadataClear={onMetadataClear}
            onMetadataUndo={onMetadataUndo}
            onOpenPage={onOpenPage}
            onPickFolder={onPickFolder}
            onRawChange={onRawChange}
            onResolve={onResolve}
          />

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {!readOnly && (
              <>
                {editableRows.length === 0 ? null : (
                  <Button variant="secondary" onPress={onRunMatching}>
                    Run matching
                  </Button>
                )}
                {availabilityPendingCount === 0 ? null : (
                  <Button variant="secondary" onPress={onRecheckAvailability}>
                    Check availability
                  </Button>
                )}
                {availableCount === 0 && selected.size === 0 ? null : (
                  <Button isDisabled={selected.size === 0} variant="primary" onPress={onCreate}>
                    Create {selected.size > 0 ? selected.size : ''}
                  </Button>
                )}
              </>
            )}
            {editableRows.length > 0 && (
              <span className="text-sm text-muted">
                {unresolvedCount} unresolved · {availabilityPendingCount} waiting · {availableCount} available to create
                {searchFailedCount > 0 ? ` · ${searchFailedCount} search failed` : null}
              </span>
            )}
          </div>
        </Card.Content>
      </Card>
    </section>
  );
}
