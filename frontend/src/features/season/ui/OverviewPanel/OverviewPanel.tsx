import { Alert } from '@heroui/react';
import seasonAirisArtwork from '../../../../assets/airis-empty-states/season.webp';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { OverviewCharts } from './OverviewCharts';
import {
  OVERVIEW_EMPTY_ACTION_LABEL,
  OVERVIEW_EMPTY_DESCRIPTION,
  OVERVIEW_EMPTY_TITLE,
} from './overview-panel.constants';
import type { OverviewPanelProps } from './overview-panel.types';
import { useOverviewPanel } from './use-overview-panel';

/**
 * OverviewPanel is the Season Workspace Overview tab. A season with no intake
 * rows shows one Airis empty state in place of the KPIs, charts and lineup;
 * its Intake action is offered only while the season is open, since a closed
 * season has nothing to start. Once rows exist, OverviewCharts answers a
 * different question per season state (how am I doing / what came out of it).
 * A store error renders alone when there is nothing loaded, and above the
 * charts when it is an action error over loaded data. Dumb composition only —
 * all Wails I/O, aggregation, and refetch orchestration live in the hooks and
 * helpers. Display-only by construction (no mutating control).
 */
export function OverviewPanel({ onNavigate }: Readonly<OverviewPanelProps>) {
  const { errorMessage, ...overview } = useOverviewPanel();
  const { readOnly, hasIntake } = overview;

  return (
    <section className="flex flex-col gap-6">
      {errorMessage !== undefined && (
        <Alert status="danger">
          <Alert.Content>
            <Alert.Description>{errorMessage}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {hasIntake ? <OverviewCharts {...overview} /> : null}

      {!hasIntake && errorMessage === undefined && (
        <AirisEmptyState
          action={readOnly ? undefined : { label: OVERVIEW_EMPTY_ACTION_LABEL, onPress: () => onNavigate('intake') }}
          description={OVERVIEW_EMPTY_DESCRIPTION}
          imageSrc={seasonAirisArtwork}
          title={OVERVIEW_EMPTY_TITLE}
        />
      )}
    </section>
  );
}
