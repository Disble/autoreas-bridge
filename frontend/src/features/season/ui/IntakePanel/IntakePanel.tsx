import { Alert, Card } from '@heroui/react';
import { IntakePanelBody } from './IntakePanelBody';
import { IntakePanelFooter } from './IntakePanelFooter';
import { IntakePanelHeader } from './IntakePanelHeader';
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
    discardedRows,
    view,
    onViewChange,
    onRestore,
    selected,
    toggleSelect,
    folderOverrides,
    folderPreviews,
    onPickFolder,
    metadataByRow,
    appliedMetadataByRow,
    metadataLookupSource,
    providerSearchSource,
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
    matchingRun,
    matchingProgressMessage,
    onRunMatching,
    onRecheckAvailability,
    onResolve,
    onDiscard,
    onOpenPage,
  } = useIntakePanel();

  return (
    <section className="flex flex-col gap-4">
      {matchingProgressMessage !== undefined && (
        <output
          aria-live="polite"
          className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-sm text-foreground"
        >
          <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-muted border-t-accent" />
          {matchingProgressMessage}
        </output>
      )}

      {busyMessage !== undefined && matchingRun === null && (
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
          <IntakePanelHeader
            activeCount={editableRows.length}
            discardedCount={discardedRows.length}
            mode={mode}
            readOnly={readOnly}
            switchMode={switchMode}
            view={view}
            onViewChange={onViewChange}
          />

          <IntakePanelBody
            appliedMetadataByRow={appliedMetadataByRow}
            discardedRows={discardedRows}
            editableRows={editableRows}
            errorMessage={errorMessage}
            folderOverrides={folderOverrides}
            folderPreviews={folderPreviews}
            metadataByRow={metadataByRow}
            metadataLookupSource={metadataLookupSource}
            providerSearchSource={providerSearchSource}
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
            onRestore={onRestore}
            view={view}
          />

          {view === 'discarded' ? null : (
            <IntakePanelFooter
              availabilityPendingCount={availabilityPendingCount}
              availableCount={availableCount}
              editableRowCount={editableRows.length}
              readOnly={readOnly}
              searchFailedCount={searchFailedCount}
              selectedCount={selected.size}
              unresolvedCount={unresolvedCount}
              onCreate={onCreate}
              onRecheckAvailability={onRecheckAvailability}
              onRunMatching={onRunMatching}
            />
          )}
        </Card.Content>
      </Card>
    </section>
  );
}
