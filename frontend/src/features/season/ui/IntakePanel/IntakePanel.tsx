import { Alert, Button, Card, Chip, Label, TextArea, TextField } from '@heroui/react';
import { INTAKE_EMPTY_MESSAGE, INTAKE_PASTE_PLACEHOLDER } from './intake-panel.constants';
import { formatCandidateOption, getMatchStatusColor, getMatchStatusLabel } from './intake-panel.helpers';
import { useIntakePanel } from './use-intake-panel';

/**
 * IntakePanel is the dual-mode "Intake & Matching" section. Raw mode edits the
 * uncreated names as plain text (debounced reconcile); List mode renders the
 * editable rows plus a read-only "already created" section. All Wails I/O and
 * state live in the colocated `useIntakePanel` hook.
 */
export function IntakePanel() {
  const {
    mode,
    switchMode,
    rawDraft,
    onRawChange,
    editableRows,
    createdRows,
    unresolvedCount,
    errorMessage,
    onRunMatching,
    onResolve,
    onDiscard,
  } = useIntakePanel();

  const isEmpty = editableRows.length === 0 && createdRows.length === 0;

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
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-foreground">Intake list</h3>
            <div className="flex gap-1">
              <Button size="sm" variant={mode === 'raw' ? 'primary' : 'tertiary'} onPress={() => switchMode('raw')}>
                Raw
              </Button>
              <Button size="sm" variant={mode === 'list' ? 'primary' : 'tertiary'} onPress={() => switchMode('list')}>
                List
              </Button>
            </div>
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
                <li key={row.id}>
                  <div className="flex flex-wrap items-center gap-3 border-b border-divider py-2">
                    <span className="font-medium text-foreground">{row.rawName}</span>
                    <Chip color={getMatchStatusColor(row.matchStatus)} size="sm" variant="soft">
                      {getMatchStatusLabel(row.matchStatus)}
                    </Chip>
                    <Button
                      aria-label={`Discard ${row.rawName}`}
                      className="ml-auto hover:text-danger"
                      size="sm"
                      variant="tertiary"
                      onPress={() => onDiscard(row.id)}
                    >
                      Discard
                    </Button>
                    {row.candidates.length > 0 && row.matchStatus !== 'matched' && (
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
              ))}
            </ul>
          )}

          <div className="mt-3 flex items-center gap-3">
            <Button isDisabled={editableRows.length === 0} variant="secondary" onPress={onRunMatching}>
              Run matching
            </Button>
            <span className="text-sm text-muted">{unresolvedCount} unresolved</span>
          </div>
        </Card.Content>
      </Card>

      {isEmpty && mode === 'list' && <p className="text-sm text-muted">{INTAKE_EMPTY_MESSAGE}</p>}

      {createdRows.length > 0 && (
        <Card>
          <Card.Header>
            <Card.Title>Already created ({createdRows.length})</Card.Title>
            <Card.Description>Read-only — manage these in the Daily Board.</Card.Description>
          </Card.Header>
          <Card.Content>
            <ul className="flex flex-col gap-1">
              {createdRows.map((row) => (
                <li key={row.id} className="flex items-center gap-3 text-sm">
                  <span className="text-foreground">{row.rawName}</span>
                  {row.section !== '' && (
                    <Chip color="default" size="sm" variant="soft">
                      {row.section}
                    </Chip>
                  )}
                </li>
              ))}
            </ul>
          </Card.Content>
        </Card>
      )}
    </section>
  );
}
