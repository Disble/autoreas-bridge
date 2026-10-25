/** A drag across the chart's bars in progress: the bar it started on and the bar under the pointer. */
export interface ActivityChartDrag {
  /** Index of the bar the drag started on. */
  readonly anchor: number;
  /** Index of the bar under the pointer. */
  readonly current: number;
}
