import { Card } from '@heroui/react';
import { ActivityDetailDrawer } from '../ActivityDetailDrawer/ActivityDetailDrawer';
import { ActivityFeed } from '../ActivityFeed/ActivityFeed';
import { ActivityTimeChart } from '../ActivityTimeChart/ActivityTimeChart';
import { ActivityToolbar } from '../ActivityToolbar/ActivityToolbar';
import { useActivityScreen } from './use-activity-screen';

/**
 * The Activity screen (activity-ui-design-v2.md): the time chart, then the
 * feed card with its toolbar and the day-grouped feed, newest first. A row
 * opens the detail drawer; ↑ / ↓ move it and Esc closes it.
 */
export function ActivityScreen() {
  const screen = useActivityScreen();

  return (
    <div className="flex flex-col gap-4">
      <ActivityTimeChart
        bars={screen.chart.bars}
        isPinning={screen.isPinning}
        onBarPointerDown={screen.onBarPointerDown}
        onBarPointerEnter={screen.onBarPointerEnter}
        onBarsPointerLeave={screen.onBarsPointerLeave}
        onBarsPointerUp={screen.onBarsPointerUp}
        onPin={screen.pin}
        onRetry={screen.onRetry}
        onScaleChange={screen.onScaleChange}
        scale={screen.scale}
        status={screen.chart.status}
        title={screen.chart.title}
      />
      <Card aria-label="Feed">
        <Card.Content className="flex flex-col gap-3">
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
              onOpenChange: screen.onFailureMenuOpenChange,
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
            onScroll={screen.feed.onScroll}
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
