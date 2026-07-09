import closeIcon from '@iconify-icons/solar/close-circle-broken';
import folderIcon from '@iconify-icons/solar/folder-with-files-broken';
import linkIcon from '@iconify-icons/solar/link-round-broken';
import { Icon } from '@iconify/react';
import { Alert, Button, Card, Chip, Label, TextArea, TextField, Tooltip } from '@heroui/react';
import { LabeledCheckbox } from '../../../../shared/ui/LabeledCheckbox';
import { INTAKE_EMPTY_MESSAGE, INTAKE_PASTE_PLACEHOLDER } from './intake-panel.constants';
import {
  formatCandidateOption,
  getAvailabilityIndicator,
  getMatchStatusColor,
  getMatchStatusLabel,
  isCreatableRow,
} from './intake-panel.helpers';
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
              {editableRows.map((row) => {
                const indicator = getAvailabilityIndicator(row);
                const creatable = isCreatableRow(row);
                return (
                  <li key={row.id}>
                    <div className="flex flex-wrap items-center gap-3 border-b border-divider py-2">
                      <LabeledCheckbox
                        isDisabled={!creatable || readOnly}
                        isSelected={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                      >
                        <span className="font-medium text-foreground">{row.rawName}</span>
                      </LabeledCheckbox>
                      <Chip color={getMatchStatusColor(row.matchStatus)} size="sm" variant="soft">
                        {getMatchStatusLabel(row.matchStatus)}
                      </Chip>
                      {creatable && (
                        <span className="text-xs text-success">
                          {row.availableChapters} chapter{row.availableChapters === 1 ? '' : 's'} available
                        </span>
                      )}
                      <div className="ml-auto flex items-center gap-2">
                        {row.matchedSlug !== '' && (
                          <Tooltip>
                            <a
                              aria-label={`Open the page for ${row.rawName}`}
                              className="inline-flex size-8 items-center justify-center rounded-md text-muted hover:text-accent"
                              href={row.matchedSlug}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <Icon className="size-4" icon={linkIcon} />
                            </a>
                            <Tooltip.Content showArrow>
                              <Tooltip.Arrow />
                              Open page
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                        {creatable && !readOnly && (
                          <Tooltip>
                            <span title={folderPreviews[row.id] ?? 'Default download folder'}>
                              <Button
                                isIconOnly
                                aria-label={`Set download folder for ${row.rawName}`}
                                className={folderOverrides[row.id] === undefined ? 'hover:text-success' : 'text-success'}
                                size="sm"
                                variant="tertiary"
                                onPress={() => onPickFolder(row.id)}
                              >
                                <Icon className="size-4" icon={folderIcon} />
                              </Button>
                            </span>
                            <Tooltip.Content showArrow>
                              <Tooltip.Arrow />
                              {folderPreviews[row.id] ?? 'Default download folder'}
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                        {!readOnly && (
                          <Tooltip>
                            <Button
                              isIconOnly
                              aria-label={`Discard ${row.rawName}`}
                              className="hover:text-danger"
                              size="sm"
                              variant="tertiary"
                              onPress={() => onDiscard(row.id)}
                            >
                              <Icon className="size-4" icon={closeIcon} />
                            </Button>
                            <Tooltip.Content showArrow>
                              <Tooltip.Arrow />
                              Discard
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                        {indicator !== null && (
                          <Tooltip>
                            <span
                              aria-label={indicator.label}
                              className={`size-2.5 shrink-0 rounded-full ${indicator.color === 'success' ? 'bg-success' : 'bg-danger'}`}
                            />
                            <Tooltip.Content showArrow>
                              <Tooltip.Arrow />
                              {indicator.label}
                            </Tooltip.Content>
                          </Tooltip>
                        )}
                      </div>
                      {creatable && folderOverrides[row.id] !== undefined && (
                        <span className="w-full break-all text-xs text-success">Folder: {folderOverrides[row.id]}</span>
                      )}
                      {!readOnly && row.candidates.length > 0 && row.matchStatus !== 'matched' && (
                        <div className="flex w-full flex-wrap gap-2">
                          {row.candidates.map((candidate) => (
                            <Button
                              key={candidate.pageUrl}
                              size="sm"
                              variant="tertiary"
                              onPress={() => onResolve(row.id, candidate.pageUrl)}
                            >
                              {formatCandidateOption(candidate)}
                            </Button>
                          ))}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
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
