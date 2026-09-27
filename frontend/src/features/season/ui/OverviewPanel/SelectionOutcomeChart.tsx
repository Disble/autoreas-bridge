import { ResponsiveBar } from '@nivo/bar';
import { buildIntegerTicks, sumStackTotal } from './overview-panel.helpers';
import {
  CHART_HEIGHT_SHORT,
  CHART_SURFACE,
  NIVO_THEME,
  SELECTION_OUTCOME_CHART_COLORS,
  SELECTION_OUTCOME_EMPTY_MESSAGE,
} from './overview-panel.constants';
import type { SelectionOutcomeChartProps } from './overview-panel.types';

/**
 * SelectionOutcomeChart renders the season's created candidates as one
 * horizontal stacked bar split into three mutually exclusive buckets: approved,
 * rejected, and no grade. The buckets are the verdicts the confirmation rules
 * applies — the backend treats an ungraded created candidate as rejected — so
 * this card is the Overview's read of the Selection tab's decision rule, never
 * a second quota meter. Colors are the chart-palette literals keyed by bucket
 * label; the legend is the second identification channel for the neutral
 * not-yet-graded segment.
 */
export function SelectionOutcomeChart({ data, keys, hasCreated }: Readonly<SelectionOutcomeChartProps>) {
  if (!hasCreated) {
    return <p className="text-sm text-muted">{SELECTION_OUTCOME_EMPTY_MESSAGE}</p>;
  }

  const total = sumStackTotal(data[0], keys);

  return (
    <div className={CHART_HEIGHT_SHORT} data-testid="selection-outcome-chart">
      <ResponsiveBar
        axisBottom={{ tickValues: buildIntegerTicks(total) }}
        axisLeft={null}
        valueScale={{ type: 'linear', min: 0, max: total }}
        borderColor={CHART_SURFACE}
        borderWidth={2}
        colors={(bar) => SELECTION_OUTCOME_CHART_COLORS[String(bar.id)] ?? CHART_SURFACE}
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
            itemWidth: 96,
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
