import { Alert, Card } from '@heroui/react';
import { GradeHistogramChart } from './GradeHistogramChart';
import { IntakeHealthChart } from './IntakeHealthChart';
import { OverviewKpiRow } from './OverviewKpiRow';
import { SlotsMeter } from './SlotsMeter';
import { useOverviewPanel } from './use-overview-panel';
import { WatchingPipelineChart } from './WatchingPipelineChart';

/**
 * OverviewPanel is the Season Workspace Overview tab: four KPI stat tiles plus
 * the watching-pipeline, intake-health, and grade-histogram charts, and the
 * approved-vs-slots meter. Dumb composition only — all Wails I/O, aggregation,
 * and refetch orchestration live in `useOverviewPanel` / `overview-panel.helpers.ts`.
 * Display-only by construction (no mutating control), so the past-season
 * read-only requirement holds without a `readOnly` branch inside this file.
 */
export function OverviewPanel() {
  const { errorMessage, kpi, pipeline, pipelineKeys, intakeHealth, intakeHealthKeys, gradeHistogram, minApprovalGrade, slotsMeter, hasCreated, hasIntake, hasGrades } =
    useOverviewPanel();

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
            <WatchingPipelineChart data={pipeline} hasCreated={hasCreated} keys={pipelineKeys} />
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
            <Card.Title>Approved vs slots</Card.Title>
          </Card.Header>
          <Card.Content>
            <SlotsMeter model={slotsMeter} />
          </Card.Content>
        </Card>
      </div>
    </section>
  );
}
