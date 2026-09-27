import { Alert, Card } from '@heroui/react';
import { GradeHistogramChart } from './GradeHistogramChart';
import { IntakeHealthChart } from './IntakeHealthChart';
import { OverviewKpiRow } from './OverviewKpiRow';
import { SELECTION_OUTCOME_CARD_DESCRIPTION } from './overview-panel.constants';
import { SelectionOutcomeChart } from './SelectionOutcomeChart';
import { useOverviewPanel } from './use-overview-panel';
import { WatchingPipelineChart } from './WatchingPipelineChart';

/**
 * OverviewPanel is the Season Workspace Overview tab: four KPI stat tiles plus
 * the watching-pipeline, intake-health, grade-histogram, and selection-outcome
 * charts. Dumb composition only — all Wails I/O, aggregation, and refetch
 * orchestration live in `useOverviewPanel` / `overview-panel.helpers.ts`.
 * Display-only by construction (no mutating control), so the past-season
 * read-only requirement holds without a `readOnly` branch inside this file.
 */
export function OverviewPanel() {
  const {
    errorMessage,
    readOnly,
    kpi,
    pipeline,
    pipelineKeys,
    intakeHealth,
    intakeHealthKeys,
    gradeHistogram,
    minApprovalGrade,
    selectionOutcome,
    selectionOutcomeKeys,
    hasCreated,
    hasIntake,
    hasGrades,
  } = useOverviewPanel();

  return (
    <section className="flex flex-col gap-6">
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <OverviewKpiRow kpi={kpi} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <Card.Header>
            <Card.Title>Watching pipeline</Card.Title>
          </Card.Header>
          <Card.Content>
            <WatchingPipelineChart data={pipeline} hasCreated={hasCreated} isHistorical={readOnly} keys={pipelineKeys} />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Intake health</Card.Title>
          </Card.Header>
          <Card.Content>
            <IntakeHealthChart data={intakeHealth} hasIntake={hasIntake} keys={intakeHealthKeys} />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Grade histogram</Card.Title>
          </Card.Header>
          <Card.Content>
            <GradeHistogramChart data={gradeHistogram} hasGrades={hasGrades} minApprovalGrade={minApprovalGrade} />
          </Card.Content>
        </Card>

        <Card>
          <Card.Header>
            <Card.Title>Selection outcome</Card.Title>
            <Card.Description>{SELECTION_OUTCOME_CARD_DESCRIPTION}</Card.Description>
          </Card.Header>
          <Card.Content>
            <SelectionOutcomeChart data={selectionOutcome} hasCreated={hasCreated} keys={selectionOutcomeKeys} />
          </Card.Content>
        </Card>
      </div>
    </section>
  );
}
