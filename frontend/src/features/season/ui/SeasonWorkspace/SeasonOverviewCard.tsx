import { Button, Card, Typography } from '@heroui/react';
import { SEASON_OVERVIEW_FACTS, SEASON_WORKSPACE_SEASON_MODE_MESSAGE } from './season-workspace.constants';
import type { SeasonOverviewCardProps } from './season-workspace.types';

/**
 * SeasonOverviewCard heads an open season's Overview: the season's facts, the
 * season-mode explanation and the Close season action, together, because
 * closing the season is what turns season mode off.
 */
export function SeasonOverviewCard({ overview, onCloseSeason }: Readonly<SeasonOverviewCardProps>) {
  return (
    <Card aria-label="Season" role="region">
      <Card.Content className="flex-row flex-wrap items-center gap-6">
        <dl className="flex min-w-0 flex-1 basis-104 flex-wrap gap-8">
          {SEASON_OVERVIEW_FACTS.map((fact) => (
            <div key={fact.field}>
              <dt className="text-xs text-muted">{fact.label}</dt>
              <dd className="mt-0.5 font-medium text-foreground">{overview[fact.field]}</dd>
            </div>
          ))}
        </dl>
        <div className="flex items-center gap-3">
          <Typography className="max-w-56 text-right" color="muted" type="body-sm">
            {SEASON_WORKSPACE_SEASON_MODE_MESSAGE}
          </Typography>
          <Button variant="secondary" onPress={onCloseSeason}>
            Close season
          </Button>
        </div>
      </Card.Content>
    </Card>
  );
}
