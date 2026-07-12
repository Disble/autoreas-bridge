import type { BarCustomLayerProps } from '@nivo/bar';
import { THRESHOLD_MARKER_INK } from './overview-panel.constants';
import type { GradeBandScale, GradeHistogramNivoDatum } from './overview-panel.types';

/** Draws the minimum-grade boundary without creating a nested React component. */
export function GradeThresholdLayer({ bars, xScale, innerHeight }: Readonly<BarCustomLayerProps<GradeHistogramNivoDatum>>) {
  const minApprovalGrade = Number(bars[0]?.data.data.minApprovalGrade ?? 0);
  const bandScale = xScale as unknown as GradeBandScale & ((value: string) => number | undefined);
  if (minApprovalGrade <= 0 || typeof bandScale.step !== 'function' || typeof bandScale.bandwidth !== 'function') {
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
}
