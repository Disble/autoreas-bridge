import { Alert, Button, Card, Skeleton, ToggleButton, ToggleButtonGroup, Tooltip, Typography } from '@heroui/react';
import { ICON_ACTION_TOOLTIP_DELAY_MS } from '../../../../shared/ui/IconActionButton/icon-action-button.constants';
import { ACTIVITY_CHART_BARS_CLASS, ACTIVITY_CHART_SKELETON_BARS, ACTIVITY_SCALE_BUTTON_CLASS, ACTIVITY_SCALE_GROUP_CLASS, ACTIVITY_CARD_CLASS, ACTIVITY_SCALE_OPTIONS, ACTIVITY_SKELETON_SHIMMER_CLASS } from '../../feed/activity-feed.constants';
import { ACTIVITY_BAR_FILL_CLASS, ACTIVITY_BAR_GAP_CLASS,ACTIVITY_LEGEND_GAP_CLASS, ACTIVITY_BAR_SLOT_CLASS, ACTIVITY_CHART_DENSITY_CLASS, ACTIVITY_CHART_LOADING_LABEL } from './activity-time-chart.constants';
import type { ActivityTimeChartProps } from './activity-time-chart.types';

/**
 * The time chart card: the scale switch, one bar per slot (blue height for
 * activity, a red cap where something failed, a green line after the newest
 * slot), and the axis ticks. Dragging across bars selects their time range;
 * clicking one bar selects that slot. Each bar names its slot in a Tooltip,
 * which stays closed while a drag runs.
 */
export function ActivityTimeChart({
  title,
  scale,
  onScaleChange,
  status,
  bars,
  density,
  isDragging,
  onBarPointerDown,
  onBarPointerEnter,
  onBarsPointerUp,
  onBarsPointerLeave,
  onRetry,
}: ActivityTimeChartProps) {
  return (
    <Card className={ACTIVITY_CARD_CLASS}>
      <Card.Content className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Typography className="text-sm leading-normal text-muted" id="activity-chart-title" type="body-sm">
            {title}
          </Typography>
          <ToggleButtonGroup
            aria-label="Chart scale"
            className={ACTIVITY_SCALE_GROUP_CLASS}
            disallowEmptySelection
            isDetached
            onSelectionChange={onScaleChange}
            selectedKeys={[scale]}
            selectionMode="single"
            size="sm"
          >
            {ACTIVITY_SCALE_OPTIONS.map((option) => (
              <ToggleButton className={ACTIVITY_SCALE_BUTTON_CLASS} id={option.id} key={option.id} variant="ghost">
                {option.label}
              </ToggleButton>
            ))}
          </ToggleButtonGroup>
        </div>
        {status === 'loading' ? (
          <div
            aria-labelledby="activity-chart-loading"
            aria-live="polite"
            className={`${ACTIVITY_CHART_BARS_CLASS} gap-1`}
            role="status"
            style={{ gridTemplateColumns: `repeat(${ACTIVITY_CHART_SKELETON_BARS}, minmax(0, 1fr))` }}
          >
            <span className="sr-only" id="activity-chart-loading">
              {ACTIVITY_CHART_LOADING_LABEL}
            </span>
            {Array.from({ length: ACTIVITY_CHART_SKELETON_BARS }, (_unused, index) => (
              <Skeleton animationType="shimmer" className={`h-1/2 w-full rounded-md ${ACTIVITY_SKELETON_SHIMMER_CLASS}`} data-testid="activity-chart-skeleton-bar" key={index} />
            ))}
          </div>
        ) : null}
        {status === 'failed' ? (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Activity could not read its chart and counts</Alert.Title>
              <Button className="mt-2 self-start" onPress={onRetry} size="sm" variant="secondary">
                Try again
              </Button>
            </Alert.Content>
          </Alert>
        ) : null}
        {status === 'ready' ? (
          <div className="flex flex-col">
            <div
              aria-label="Activity over time. Drag across bars to pick a time range."
              className={`${ACTIVITY_CHART_BARS_CLASS} ${ACTIVITY_CHART_DENSITY_CLASS.bars[density]} touch-none select-none ${isDragging ? '[&_button]:cursor-ew-resize' : ''}`}
              data-chart-density={density}
              data-chart-dragging={isDragging ? '' : undefined}
              onPointerLeave={onBarsPointerLeave}
              onPointerUp={onBarsPointerUp}
              role="group"
              style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
            >
              {bars.map((bar, index) => (
                <Tooltip delay={ICON_ACTION_TOOLTIP_DELAY_MS} isDisabled={isDragging} key={bar.key}>
                  <Tooltip.Trigger className="flex h-full min-w-0" role="presentation" tabIndex={-1}>
                    <button
                      aria-label={bar.label}
                      aria-pressed={bar.state === 'selected'}
                      className={`relative flex h-full w-full cursor-pointer items-end ${ACTIVITY_CHART_DENSITY_CLASS.bar[density]} ${ACTIVITY_BAR_SLOT_CLASS[bar.state]}`}
                      data-chart-bar={bar.state}
                      onPointerDown={() => onBarPointerDown(index)}
                      onPointerEnter={() => onBarPointerEnter(index)}
                      type="button"
                    >
                      <span
                        className={`relative flex w-full flex-col overflow-hidden ${ACTIVITY_CHART_DENSITY_CLASS.fill[density]} ${bar.isGap ? ACTIVITY_BAR_GAP_CLASS : ACTIVITY_BAR_FILL_CLASS[bar.state]}`}
                        data-chart-gap={bar.isGap ? '' : undefined}
                        style={{ height: `${bar.heightPercent}%` }}
                      >
                        {bar.failPercent > 0 ? <span className="min-h-[3px] w-full shrink-0 bg-danger" data-chart-failure style={{ height: `${bar.failPercent}%` }} /> : null}
                      </span>
                    </button>
                  </Tooltip.Trigger>
                  <Tooltip.Content showArrow>
                    <Tooltip.Arrow />
                    {bar.label}
                  </Tooltip.Content>
                </Tooltip>
              ))}
            </div>
            <div
              aria-hidden
              className={`mt-1.5 grid text-[11px] tabular-nums text-muted ${ACTIVITY_CHART_DENSITY_CLASS.bars[density]}`}
              style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
            >
              {bars.map((bar) => (
                <span className={`overflow-visible whitespace-nowrap ${ACTIVITY_CHART_DENSITY_CLASS[bar.isNow ? 'nowTick' : 'tick'][density]} ${bar.isTodayTick ? 'text-foreground' : ''}`} key={bar.key}>
                  {bar.tick}
                </span>
              ))}
            </div>
            <div className="mt-2.5 flex gap-4 text-xs leading-normal text-muted">
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-3 rounded-[2px] ${ACTIVITY_BAR_FILL_CLASS.idle}`} />
                Activity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-3 rounded-[2px] bg-danger" />
                Something failed
              </span>
              <span className="flex items-center gap-1.5">
                <span className={`h-2 w-3 rounded-[2px] ${ACTIVITY_LEGEND_GAP_CLASS}`} />
                No activity
              </span>
            </div>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}
