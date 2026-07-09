import type { BarCustomLayer, BarCustomLayerProps } from '@nivo/bar';
import { ResponsiveBar } from '@nivo/bar';
import type { ScaleBand } from '@nivo/scales';
import {
  CHART_HEIGHT_TALL,
  CHART_SURFACE,
  DE_EMPHASIS_COLOR,
  EMPHASIS_COLOR,
  GRADE_HISTOGRAM_EMPTY_MESSAGE,
  NIVO_THEME,
  THRESHOLD_MARKER_INK,
} from './overview-panel.constants';
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

  const chartData: GradeHistogramNivoDatum[] = data.map(({ grade, count }) => ({ grade, count }));

  // Closed over minApprovalGrade: nivo's `layers` array only accepts bare
  // FunctionComponent<BarCustomLayerProps<D>> values, so the threshold cannot
  // travel as a JSX prop. Draws a 1px hairline + "Min N" label at the gap
  // between the last de-emphasized band and the first emphasized one.
  const ThresholdLayer: BarCustomLayer<GradeHistogramNivoDatum> = ({ xScale, innerHeight }: BarCustomLayerProps<GradeHistogramNivoDatum>) => {
    const bandScale = xScale as unknown as ScaleBand<string>;
    if (typeof bandScale.step !== 'function' || typeof bandScale.bandwidth !== 'function') {
      return null;
    }
    const bandStart = bandScale(String(minApprovalGrade));
    if (bandStart === undefined) {
      return null;
    }
    const gap = bandScale.step() - bandScale.bandwidth();
    const hairlineX = bandStart - gap / 2;

    return (
      <g>
        <line stroke={THRESHOLD_MARKER_INK} strokeWidth={1} x1={hairlineX} x2={hairlineX} y1={0} y2={innerHeight} />
        <text fill={THRESHOLD_MARKER_INK} fontSize={11} x={hairlineX + 4} y={12}>
          {`Min ${minApprovalGrade}`}
        </text>
      </g>
    );
  };

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
        layers={['grid', 'axes', 'bars', ThresholdLayer, 'markers', 'legends', 'annotations']}
        layout="vertical"
        legends={[]}
        margin={{ top: 16, right: 8, bottom: 40, left: 32 }}
        theme={NIVO_THEME}
      />
    </div>
  );
}
