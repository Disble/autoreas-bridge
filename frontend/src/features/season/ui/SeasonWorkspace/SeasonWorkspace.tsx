import type { ComponentPropsWithoutRef } from 'react';
import { Alert, Button, Card, Chip, Input, Label, Skeleton, Tabs, TextField } from '@heroui/react';
import {
  SEASON_WORKSPACE_EMPTY_MESSAGE,
  SEASON_WORKSPACE_EMPTY_TITLE,
  SEASON_WORKSPACE_SEASON_MODE_MESSAGE,
  SEASON_WORKSPACE_TITLE,
  SEASON_WORKSPACE_UPCOMING_MESSAGE,
} from './season-workspace.constants';
import { DailyBoard } from '../DailyBoard/DailyBoard';
import { EvaluationPanel } from '../EvaluationPanel/EvaluationPanel';
import { IntakePanel } from '../IntakePanel/IntakePanel';
import { OrderingBoard } from '../OrderingBoard/OrderingBoard';
import { SelectionBoard } from '../SelectionBoard/SelectionBoard';
import type { SeasonWorkspaceProps } from './season-workspace.types';
import { useSeasonWorkspace } from './use-season-workspace';

/**
 * SeasonWorkspace is the /season route panel. All Wails I/O and state live in
 * the colocated `useSeasonWorkspace` hook; this component is presentation-only.
 */
export function SeasonWorkspace({ className }: Readonly<SeasonWorkspaceProps>) {
  const {
    season,
    isLoading,
    errorMessage,
    readOnly,
    overview,
    sections,
    suggestedName,
    pastSeasonEntries,
    onCreateSeason,
    onCloseSeason,
    onViewPastSeason,
    onExitPastSeason,
  } = useSeasonWorkspace();

  if (isLoading) {
    return (
      <section aria-label="Loading season" className={className}>
        <Skeleton className="h-40 w-full rounded-lg" />
      </section>
    );
  }

  const handleCreate: NonNullable<ComponentPropsWithoutRef<'form'>['onSubmit']> = (event) => {
    event.preventDefault();
    const value = new FormData(event.currentTarget).get('seasonName');
    onCreateSeason(typeof value === 'string' && value.trim() !== '' ? value.trim() : suggestedName);
  };

  return (
    <section className={`flex flex-col gap-4 ${className ?? ''}`}>
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">{SEASON_WORKSPACE_TITLE}</h1>
        <p className="text-sm text-muted">Run the new-season anime selection workflow.</p>
      </header>

      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {season === null || overview === null ? (
        <div className="flex flex-col gap-4">
          <Card>
            <Card.Header>
              <Card.Title>{SEASON_WORKSPACE_EMPTY_TITLE}</Card.Title>
              <Card.Description>{SEASON_WORKSPACE_EMPTY_MESSAGE}</Card.Description>
            </Card.Header>
            <Card.Content>
              <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleCreate}>
                <TextField className="sm:max-w-xs" defaultValue={suggestedName} name="seasonName">
                  <Label>Season name</Label>
                  <Input />
                </TextField>
                <Button type="submit" variant="primary">
                  Create season
                </Button>
              </form>
            </Card.Content>
          </Card>

          {pastSeasonEntries.length > 0 && (
            <Card>
              <Card.Header>
                <Card.Title>Past seasons</Card.Title>
                <Card.Description>Open a past season to review its full workflow read-only.</Card.Description>
              </Card.Header>
              <Card.Content>
                <ul className="flex flex-col gap-2">
                  {pastSeasonEntries.map((entry) => (
                    <li key={entry.id}>
                      <Button
                        className="w-full justify-between gap-3"
                        variant="tertiary"
                        onPress={() => onViewPastSeason(entry.id)}
                      >
                        <span className="font-medium text-foreground">{entry.name}</span>
                        <Chip color={entry.statusColor} size="sm" variant="soft">
                          {entry.statusLabel}
                        </Chip>
                        <span className="text-xs text-muted">{entry.createdLabel}</span>
                      </Button>
                    </li>
                  ))}
                </ul>
              </Card.Content>
            </Card>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {readOnly && (
            <Alert status="warning">
              <Alert.Content>
                <Alert.Title>Read-only</Alert.Title>
                <Alert.Description>You are viewing a past season. Editing is disabled.</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <div className="flex items-center gap-3">
            <h2 className="text-xl font-semibold text-foreground">{overview.title}</h2>
            <Chip color={overview.statusColor} size="sm" variant="soft">
              {overview.statusLabel}
            </Chip>
            {readOnly && (
              <Button className="ml-auto" variant="secondary" onPress={onExitPastSeason}>
                Back to history
              </Button>
            )}
          </div>

          {!readOnly && (
            <Alert status="accent">
              <Alert.Content>
                <Alert.Description>{SEASON_WORKSPACE_SEASON_MODE_MESSAGE}</Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          <Tabs defaultSelectedKey="overview">
            <Tabs.ListContainer>
              <Tabs.List aria-label="Season workflow">
                {sections.map((tab) => (
                  <Tabs.Tab key={tab.id} id={tab.id} isDisabled={!tab.available}>
                    {tab.label}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>

            <Tabs.Panel id="intake">
              <div className="flex flex-col gap-6">
                <IntakePanel />
                <DailyBoard />
              </div>
            </Tabs.Panel>

            <Tabs.Panel id="evaluation">
              <EvaluationPanel />
            </Tabs.Panel>

            <Tabs.Panel id="selection">
              <SelectionBoard />
            </Tabs.Panel>

            <Tabs.Panel id="ordering">
              <OrderingBoard />
            </Tabs.Panel>

            <Tabs.Panel id="overview">
              <Card>
                <Card.Content>
                  <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                    <div>
                      <dt className="text-xs text-muted">Created</dt>
                      <dd className="text-sm text-foreground">{overview.createdLabel}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Minimum approval grade</dt>
                      <dd className="text-sm text-foreground">{overview.minApprovalGrade}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Slots</dt>
                      <dd className="text-sm text-foreground">{overview.slots}</dd>
                    </div>
                  </dl>
                </Card.Content>
              </Card>

              <p className="mt-3 text-sm text-muted">{SEASON_WORKSPACE_UPCOMING_MESSAGE}</p>

              {!readOnly && (
                <Button className="mt-4" variant="secondary" onPress={onCloseSeason}>
                  Close season
                </Button>
              )}
            </Tabs.Panel>
          </Tabs>
        </div>
      )}
    </section>
  );
}
