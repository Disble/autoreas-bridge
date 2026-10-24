import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { Icon } from '@iconify/react';
import bridgeIcon from '@iconify-icons/solar/monitor-linear';
import phoneIcon from '@iconify-icons/solar/smartphone-linear';
import { ACTIVITY_ALL_TYPES_KEY, ACTIVITY_SEGMENT_BUTTON_CLASS, ACTIVITY_SEGMENT_GROUP_CLASS } from '../../feed/activity-feed.constants';
import { ActivityFailureButton } from './ActivityFailureButton';
import { ActivityRangeField } from './ActivityRangeField';
import { ACTIVITY_COUNT_CHIP_CLASS, ACTIVITY_FAILED_CHIP_CLASS } from './activity-toolbar.constants';
import type { ActivityToolbarProps } from './activity-toolbar.types';

/**
 * The feed toolbar (activity-ui-design-v2.md, Filters): the range field (the
 * same range the chart edits), origin, then the type toggles with their counts
 * and the failure button at the end of their row. When the window is too
 * narrow for one row, the types and the failure button wrap together.
 */
export function ActivityToolbar({
  range,
  origin,
  onOriginChange,
  typeToggles,
  typeKeys,
  failuresOnly,
  onTypesChange,
  failure,
}: ActivityToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 border-b border-separator pb-3.5" role="toolbar" aria-label="Activity filters">
      <ActivityRangeField {...range} />
      <ToggleButtonGroup
        aria-label="Where"
        className={ACTIVITY_SEGMENT_GROUP_CLASS}
        disallowEmptySelection
        isDetached
        onSelectionChange={onOriginChange}
        selectedKeys={[origin]}
        selectionMode="single"
        size="sm"
      >
        <ToggleButton className={ACTIVITY_SEGMENT_BUTTON_CLASS} id="all" variant="ghost">
          All
        </ToggleButton>
        <ToggleButton aria-label="Phone" className={ACTIVITY_SEGMENT_BUTTON_CLASS} id="phone" variant="ghost">
          <Icon aria-hidden className="mx-0 size-4" icon={phoneIcon} />
        </ToggleButton>
        <ToggleButton aria-label="Bridge" className={ACTIVITY_SEGMENT_BUTTON_CLASS} id="bridge" variant="ghost">
          <Icon aria-hidden className="mx-0 size-4" icon={bridgeIcon} />
        </ToggleButton>
      </ToggleButtonGroup>
      <div className="flex min-w-0 flex-[1_1_auto] items-center gap-2.5" data-activity-types-row>
        <ToggleButtonGroup
          aria-label="What"
          className={`${ACTIVITY_SEGMENT_GROUP_CLASS} max-w-full justify-start overflow-x-auto ${failuresOnly ? 'opacity-45' : ''}`}
          isDetached
          onSelectionChange={onTypesChange}
          selectedKeys={typeKeys}
          selectionMode="multiple"
          size="sm"
        >
          <ToggleButton className={ACTIVITY_SEGMENT_BUTTON_CLASS} id={ACTIVITY_ALL_TYPES_KEY} variant="ghost">
            All
          </ToggleButton>
          {typeToggles.map((toggle) => (
            <ToggleButton className={ACTIVITY_SEGMENT_BUTTON_CLASS} id={toggle.type} key={toggle.type} variant="ghost">
              {toggle.label}
              {toggle.lines === undefined ? null : <span className={ACTIVITY_COUNT_CHIP_CLASS}>{toggle.lines}</span>}
              {toggle.failed === 0 ? null : (
                <span aria-label={`${toggle.failed} failed`} className={ACTIVITY_FAILED_CHIP_CLASS} role="img" title={`${toggle.failed} failed`}>
                  {toggle.failed}
                </span>
              )}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <span className="flex-1" />
        <ActivityFailureButton {...failure} />
      </div>
    </div>
  );
}
