import { ResponsiveBar } from '@nivo/bar';
import { buildIntegerTicks, sumStackTotal } from './overview-panel.helpers';
import { CHART_HEIGHT_SHORT, CHART_SURFACE, NIVO_THEME, PIPELINE_COLORS, PIPELINE_EMPTY_MESSAGE } from './overview-panel.constants';
import type { WatchingPipelineChartProps } from './overview-panel.types';

/**
 * WatchingPipelineChart renders created animes grouped by their Estrenos
 * section (Sin ver -> Ver hoy -> Visto) as one horizontal stacked bar, the
 * stages fixed in conveyor order regardless of which has the largest count.
 * Pure props in, no store access.
 */
export function WatchingPipelineChart({ data, keys, hasCreated }: Readonly<WatchingPipelineChartProps>) {
  if (!hasCreated) {
    return <p className="text-sm text-muted">{PIPELINE_EMPTY_MESSAGE}</p>;
  }

  const total = sumStackTotal(data[0], keys);

  return (
    <div className={CHART_HEIGHT_SHORT} data-testid="watching-pipeline-chart">
      <ResponsiveBar
        axisBottom={{ tickValues: buildIntegerTicks(total) }}
        axisLeft={null}
        valueScale={{ type: 'linear', min: 0, max: total }}
        borderColor={CHART_SURFACE}
        borderWidth={2}
        colors={(bar) => PIPELINE_COLORS[String(bar.id)] ?? CHART_SURFACE}
        data={[...data]}
        enableGridX
        enableGridY={false}
        enableLabel={false}
        indexBy="stage"
        keys={[...keys]}
        layout="horizontal"
        legends={[
          {
            dataFrom: 'keys',
            anchor: 'bottom',
            direction: 'row',
            translateY: 56,
            itemWidth: 90,
            itemHeight: 18,
            symbolSize: 12,
          },
        ]}
        margin={{ top: 8, right: 8, bottom: 72, left: 8 }}
        theme={NIVO_THEME}
      />
    </div>
  );
}
