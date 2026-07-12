import { ResponsiveBar } from '@nivo/bar';
import {
  CHART_HEIGHT_TALL,
  CHART_SURFACE,
  DE_EMPHASIS_COLOR,
  EMPHASIS_COLOR,
  GRADE_HISTOGRAM_EMPTY_MESSAGE,
  NIVO_THEME,
} from './overview-panel.constants';
import { GradeThresholdLayer } from './GradeThresholdLayer';
import type { GradeHistogramChartProps, GradeHistogramNivoDatum } from './overview-panel.types';

/**
 * GradeHistogramChart renders a vertical column per grade 1-6, emphasizing the
 * columns at/above `minApprovalGrade` and de-emphasizing the rest, with a
 * labeled threshold marker at the boundary. Pure props in, no store access.
 */
export function GradeHistogramChart({ data, minApprovalGrade, hasGrades }: Readonly<GradeHistogramChartProps>) {
  if (!hasGrades) {
    return <p className="text-sm text-muted">{GRADE_HISTOGRAM_EMPTY_MESSAGE}</p>;
  }

  const chartData: GradeHistogramNivoDatum[] = data.map(({ grade, count }) => ({ grade, count, minApprovalGrade }));

  return (
    <div className={CHART_HEIGHT_TALL} data-testid="grade-histogram-chart">
      <ResponsiveBar
        axisBottom={{ legend: 'Grade', legendPosition: 'middle', legendOffset: 32 }}
        borderColor={CHART_SURFACE}
        colors={(bar) => (Number(bar.indexValue) >= minApprovalGrade ? EMPHASIS_COLOR : DE_EMPHASIS_COLOR)}
        data={chartData}
        enableGridX={false}
        enableLabel={false}
        indexBy="grade"
        keys={['count']}
        layers={['grid', 'axes', 'bars', GradeThresholdLayer, 'markers', 'legends', 'annotations']}
        layout="vertical"
        legends={[]}
        margin={{ top: 16, right: 8, bottom: 40, left: 32 }}
        theme={NIVO_THEME}
      />
    </div>
  );
}
