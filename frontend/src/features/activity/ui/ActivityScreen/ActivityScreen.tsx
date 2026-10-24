import { Card } from '@heroui/react';
import pinIcon from '@iconify-icons/solar/pin-bold';
import { IconActionButton } from '../../../../shared/ui/IconActionButton/IconActionButton';
import { PageHeader } from '../../../../shared/ui/PageHeader/PageHeader';
import { ActivityDetailDrawer } from '../ActivityDetailDrawer/ActivityDetailDrawer';
import { ActivityFeed } from '../ActivityFeed/ActivityFeed';
import { ActivityTimeChart } from '../ActivityTimeChart/ActivityTimeChart';
import { ActivityToolbar } from '../ActivityToolbar/ActivityToolbar';
import { ACTIVITY_CARD_CLASS } from '../../feed/activity-feed.constants';
import { useActivityPhoneStatus } from '../../feed/use-activity-phone-status';
import { useActivityScreen } from './use-activity-screen';

/**
 * The Activity screen (activity-ui-design-v2.md): the page header with "Pin
 * this moment", the phone status line under it, the time chart, then the
 * feed card with its toolbar and the day-grouped feed, newest first. A row
 * opens the detail drawer; ↑ / ↓ move it and Esc closes it.
 */
export function ActivityScreen() {
  const screen = useActivityScreen();
  const phoneStatus = useActivityPhoneStatus();

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        actions={<IconActionButton ariaLabel="Pin this moment" icon={pinIcon} isDisabled={screen.isPinning} onPress={screen.pin} tooltip="Pin this moment" variant="tertiary" />}
        title="Activity"
      />
      {phoneStatus === undefined ? null : (
        <p className="-mt-[7px] flex w-max items-center gap-2 text-[13px] text-muted" data-phone-status={phoneStatus.isConnected ? 'connected' : 'offline'} title="Last contact from the phone">
          <span aria-hidden className={`size-2 rounded-full ${phoneStatus.isConnected ? 'bg-success' : 'bg-muted'}`} />
          {phoneStatus.label}
        </p>
      )}
      <ActivityTimeChart
        bars={screen.chart.bars}
        density={screen.chart.density}
        isDragging={screen.chart.isDragging}
        onBarPointerDown={screen.onBarPointerDown}
        onBarPointerEnter={screen.onBarPointerEnter}
        onBarsPointerLeave={screen.onBarsPointerLeave}
        onBarsPointerUp={screen.onBarsPointerUp}
        onRetry={screen.onRetry}
        onScaleChange={screen.onScaleChange}
        scale={screen.scale}
        status={screen.chart.status}
        title={screen.chart.title}
      />
      <Card aria-label="Feed" className={ACTIVITY_CARD_CLASS}>
        <Card.Content className="flex flex-col">
          <ActivityToolbar
            calendarMax={screen.calendarBounds.maxValue}
            calendarMin={screen.calendarBounds.minValue}
            calendarValue={screen.calendarValue}
            failure={{
              state: screen.failureButtonState,
              count: screen.failureCount,
              rows: screen.failureRows,
              selectedKeys: screen.failureMenuKeys.selected,
              disabledKeys: screen.failureMenuKeys.disabled,
              groupRef: screen.failureGroupRef,
              onToggle: screen.onFailureToggle,
              onSelectionChange: screen.onFailureTypesChange,
              onClear: screen.onFailureClear,
            }}
            failuresOnly={screen.failuresOnly}
            hasRange={screen.hasRange}
            onCalendarChange={screen.onCalendarChange}
            onClearRange={screen.onClearRange}
            onOriginChange={screen.onOriginChange}
            onTypesChange={screen.onTypesChange}
            origin={screen.origin}
            rangeLabel={screen.rangeLabel}
            typeKeys={screen.typeKeys}
            typeToggles={screen.typeToggles}
          />
          <ActivityFeed
            days={screen.feed.days}
            endMark={screen.feed.endMark}
            hasMore={screen.feed.hasMore}
            isLoadingMore={screen.feed.isLoadingMore}
            onRetry={screen.onRetry}
            onSelectRow={screen.onSelectRow}
            resolvedView={screen.feed.resolvedView}
            status={screen.feed.status}
          />
        </Card.Content>
      </Card>
      <div className="contents" data-activity-drawer>
        <ActivityDetailDrawer line={screen.openLine} onClose={screen.onCloseDrawer} />
      </div>
    </div>
  );
}
