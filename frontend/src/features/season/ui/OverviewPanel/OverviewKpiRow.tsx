import { Card, Typography } from '@heroui/react';
import type { OverviewKpiRowProps } from './overview-panel.types';

/**
 * OverviewKpiRow renders the four Overview stat tiles: Intake rows total,
 * Created animes, Rated x/y, and Approved n/slots. Pure props in, no store
 * access — every number arrives already derived.
 */
export function OverviewKpiRow({ kpi }: Readonly<OverviewKpiRowProps>) {
  const tiles = [
    { label: 'Intake rows total', value: String(kpi.intakeTotal) },
    { label: 'Created animes', value: String(kpi.createdCount) },
    { label: 'Rated', value: `${kpi.ratedCount} / ${kpi.ratedTotal}` },
    { label: 'Approved', value: `${kpi.approvedCount} / ${kpi.slots}` },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {tiles.map((tile) => (
        <Card key={tile.label}>
          <Card.Content>
            <Typography color="muted" type="body-sm">
              {tile.label}
            </Typography>
            <Typography className="font-semibold" type="h4">
              {tile.value}
            </Typography>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
