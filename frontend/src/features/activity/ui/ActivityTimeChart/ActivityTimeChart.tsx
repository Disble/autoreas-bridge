import { Alert, Button, Card, Skeleton, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react';
import pinIcon from '@iconify-icons/solar/pin-bold';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { ACTIVITY_CHART_BARS_CLASS, ACTIVITY_CHART_SKELETON_BARS, ACTIVITY_SCALE_OPTIONS } from '../../feed/activity-feed.constants';
import { ACTIVITY_BAR_FILL_CLASS, ACTIVITY_CHART_LOADING_LABEL } from './activity-time-chart.constants';
import type { ActivityTimeChartProps } from './activity-time-chart.types';

/**
 * The time chart card: the scale switch, one bar per slot (blue height for
 * activity, a red cap where something failed), axis ticks, and "Pin this
 * moment". Dragging across bars selects their time range; clicking one bar
 * selects that slot.
 */
export function ActivityTimeChart({
  title,
  scale,
  onScaleChange,
  status,
  bars,
  onBarPointerDown,
  onBarPointerEnter,
  onBarsPointerUp,
  onBarsPointerLeave,
  onRetry,
  isPinning,
  onPin,
}: ActivityTimeChartProps) {
  return (
    <Card>
      <Card.Content className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Typography id="activity-chart-title" type="body-sm">
            {title}
          </Typography>
          <div className="flex items-center gap-2">
            <ToggleButtonGroup aria-label="Chart scale" disallowEmptySelection onSelectionChange={onScaleChange} selectedKeys={[scale]} selectionMode="single" size="sm">
              {ACTIVITY_SCALE_OPTIONS.map((option) => (
                <ToggleButton id={option.id} key={option.id}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <IconActionButton ariaLabel="Pin this moment" icon={pinIcon} isDisabled={isPinning} onPress={onPin} tooltip="Pin this moment" />
          </div>
        </div>
        {status === 'loading' ? (
          <div aria-labelledby="activity-chart-loading" aria-live="polite" className={ACTIVITY_CHART_BARS_CLASS} role="status" style={{ gridTemplateColumns: `repeat(${ACTIVITY_CHART_SKELETON_BARS}, minmax(0, 1fr))` }}>
            <span className="sr-only" id="activity-chart-loading">
              {ACTIVITY_CHART_LOADING_LABEL}
            </span>
            {Array.from({ length: ACTIVITY_CHART_SKELETON_BARS }, (_unused, index) => (
              <Skeleton className="h-1/2 w-full rounded-t-sm" data-testid="activity-chart-skeleton-bar" key={index} />
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
          <div className="flex flex-col gap-1">
            <div
              aria-label="Activity over time. Drag across bars to pick a time range."
              className={`${ACTIVITY_CHART_BARS_CLASS} touch-none select-none`}
              onPointerLeave={onBarsPointerLeave}
              onPointerUp={onBarsPointerUp}
              role="group"
              style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}
            >
              {bars.map((bar, index) => (
                <button
                  aria-label={bar.label}
                  aria-pressed={bar.state === 'selected'}
                  className="flex h-full cursor-pointer items-end rounded-t-sm hover:bg-default"
                  data-chart-bar={bar.state}
                  key={bar.key}
                  onPointerDown={() => onBarPointerDown(index)}
                  onPointerEnter={() => onBarPointerEnter(index)}
                  title={bar.label}
                  type="button"
                >
                  <span className={`flex w-full flex-col rounded-t-sm ${ACTIVITY_BAR_FILL_CLASS[bar.state]}`} style={{ height: `${bar.heightPercent}%` }}>
                    {bar.hasFailure ? <span className="h-1 w-full rounded-t-sm bg-danger" data-chart-failure /> : null}
                  </span>
                </button>
              ))}
            </div>
            <div aria-hidden className="grid gap-0.5 text-[10px] text-muted" style={{ gridTemplateColumns: `repeat(${bars.length}, minmax(0, 1fr))` }}>
              {bars.map((bar) => (
                <span className="overflow-visible whitespace-nowrap" key={bar.key}>
                  {bar.tick}
                </span>
              ))}
            </div>
            <div className="flex gap-4 pt-1 text-xs text-muted">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-accent/75" />
                Activity
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-sm bg-danger" />
                Something failed
              </span>
            </div>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}
