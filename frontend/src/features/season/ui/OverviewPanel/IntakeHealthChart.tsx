import { ResponsiveBar } from '@nivo/bar';
import { getIntakeHealthSegmentColor } from './overview-panel.helpers';
import { CHART_HEIGHT_SHORT, CHART_SURFACE, INTAKE_HEALTH_EMPTY_MESSAGE, NIVO_THEME } from './overview-panel.constants';
import type { IntakeHealthChartProps } from './overview-panel.types';

/**
 * IntakeHealthChart renders ALL intake rows (created and uncreated) grouped by
 * matchStatus as one horizontal stacked bar, in workflow order. Colors resolve
 * via `getIntakeHealthSegmentColor` (never a re-derived switch). The legend and
 * per-segment tooltip counts are obligatory: they are the required secondary
 * identification channel for the `discarded` segment's contrast WARN (see
 * design Decision 4 / Risk 3).
 */
export function IntakeHealthChart({ data, keys, hasIntake }: Readonly<IntakeHealthChartProps>) {
  if (!hasIntake) {
    return <p className="text-sm text-muted">{INTAKE_HEALTH_EMPTY_MESSAGE}</p>;
  }

  return (
    <div className={CHART_HEIGHT_SHORT} data-testid="intake-health-chart">
      <ResponsiveBar
        axisLeft={null}
        borderColor={CHART_SURFACE}
        borderWidth={2}
        colors={(bar) => getIntakeHealthSegmentColor(String(bar.id))}
        data={[...data]}
        enableGridX
        enableGridY={false}
        enableLabel={false}
        indexBy="dim"
        keys={[...keys]}
        layout="horizontal"
        legends={[
          {
            dataFrom: 'keys',
            anchor: 'bottom',
            direction: 'row',
            translateY: 56,
            itemWidth: 82,
            itemHeight: 18,
            symbolSize: 12,
          },
        ]}
        margin={{ top: 8, right: 8, bottom: 72, left: 8 }}
        theme={NIVO_THEME}
        tooltipLabel={(datum) => `${datum.id}: ${datum.value}`}
      />
    </div>
  );
}
