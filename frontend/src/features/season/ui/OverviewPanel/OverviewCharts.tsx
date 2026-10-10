import { Card } from '@heroui/react';
import { GradeHistogramChart } from './GradeHistogramChart';
import { IntakeHealthChart } from './IntakeHealthChart';
import { OverviewFinalLineup } from './OverviewFinalLineup';
import { OverviewKpiRow } from './OverviewKpiRow';
import { OverviewOutcomeFunnel } from './OverviewOutcomeFunnel';
import { SELECTION_OUTCOME_CARD_DESCRIPTION } from './overview-panel.constants';
import type { OverviewChartsProps } from './overview-panel.types';
import { SelectionOutcomeChart } from './SelectionOutcomeChart';
import { WatchingPipelineChart } from './WatchingPipelineChart';

/**
 * OverviewCharts is what the Overview tab shows once the season has intake
 * rows. An open season answers "how am I doing": four KPI stat tiles plus the
 * watching-pipeline, intake-health, grade-histogram and selection-outcome
 * charts. A closed season answers "what came out of it": the outcome funnel,
 * the grade histogram, the selection outcome and the final lineup the season
 * recorded; the live watching pipeline, intake health and KPI tiles are
 * omitted. Dumb composition only; display-only by construction.
 */
export function OverviewCharts({
  readOnly,
  kpi,
  outcomeSteps,
  outcomeMeta,
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
}: Readonly<OverviewChartsProps>) {
  return (
    <>
      {readOnly ? <OverviewOutcomeFunnel meta={outcomeMeta} steps={outcomeSteps} /> : <OverviewKpiRow kpi={kpi} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {readOnly ? null : (
          <Card>
            <Card.Header>
              <Card.Title>Watching pipeline</Card.Title>
            </Card.Header>
            <Card.Content>
              <WatchingPipelineChart data={pipeline} hasCreated={hasCreated} keys={pipelineKeys} />
            </Card.Content>
          </Card>
        )}

        {readOnly ? null : (
          <Card>
            <Card.Header>
              <Card.Title>Intake health</Card.Title>
            </Card.Header>
            <Card.Content>
              <IntakeHealthChart data={intakeHealth} hasIntake={hasIntake} keys={intakeHealthKeys} />
            </Card.Content>
          </Card>
        )}

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

      {readOnly ? <OverviewFinalLineup /> : null}
    </>
  );
}
