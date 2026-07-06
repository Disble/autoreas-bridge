import type { FormEvent } from 'react';
import { Alert, Button, Card, Chip, Label, TextArea, TextField } from '@heroui/react';
import { INTAKE_EMPTY_MESSAGE, INTAKE_PASTE_PLACEHOLDER } from './intake-panel.constants';
import { formatCandidateOption, getMatchStatusColor, getMatchStatusLabel } from './intake-panel.helpers';
import { useIntakePanel } from './use-intake-panel';

/**
 * IntakePanel is the "Intake & Matching" workspace section: paste the plain-text
 * list, run matching against jkanime, and resolve/discard each row. All Wails
 * I/O and state live in the colocated `useIntakePanel` hook.
 */
export function IntakePanel() {
  const { rows, unresolvedCount, errorMessage, onImport, onRunMatching, onResolve, onDiscard } = useIntakePanel();

  const handleImport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('intakeText');
    if (typeof value === 'string' && value.trim() !== '') {
      onImport(value);
      event.currentTarget.reset();
    }
  };

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
          <form className="flex flex-col gap-3" onSubmit={handleImport}>
            <TextField name="intakeText">
              <Label>Intake list</Label>
              <TextArea placeholder={INTAKE_PASTE_PLACEHOLDER} rows={5} />
            </TextField>
            <div className="flex items-center gap-3">
              <Button type="submit" variant="primary">
                Import
              </Button>
              <Button isDisabled={rows.length === 0} variant="secondary" onPress={onRunMatching}>
                Run matching
              </Button>
              <span className="text-sm text-muted">{unresolvedCount} unresolved</span>
            </div>
          </form>
        </Card.Content>
      </Card>

      {rows.length === 0 ? (
        <p className="text-sm text-muted">{INTAKE_EMPTY_MESSAGE}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Card>
                <Card.Content>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="font-medium text-foreground">{row.rawName}</span>
                    <Chip color={getMatchStatusColor(row.matchStatus)} size="sm" variant="soft">
                      {getMatchStatusLabel(row.matchStatus)}
                    </Chip>
                    {row.matchStatus === 'matched' && row.matchedSlug !== '' && (
                      <span className="truncate text-xs text-muted">{row.matchedSlug}</span>
                    )}
                    {row.matchStatus !== 'discarded' && (
                      <Button
                        aria-label={`Discard ${row.rawName}`}
                        className="ml-auto hover:text-danger"
                        size="sm"
                        variant="tertiary"
                        onPress={() => onDiscard(row.id)}
                      >
                        Discard
                      </Button>
                    )}
                  </div>

                  {row.candidates.length > 0 && row.matchStatus !== 'matched' && (
                    <div className="mt-3 flex flex-wrap gap-2">
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
                </Card.Content>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
