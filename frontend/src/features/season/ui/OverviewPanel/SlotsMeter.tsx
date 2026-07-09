import { Chip } from '@heroui/react';
import { Meter } from '@heroui/react/meter';
import type { SlotsMeterProps } from './overview-panel.types';

/**
 * SlotsMeter renders approved-vs-slots as a HeroUI Meter — never a pie/donut.
 * The fill is clamped to `model.meterValue` (never exceeds the track) while
 * `Meter.Output` always shows the true ratio, so an over-quota approval is
 * capped visually without hiding the real numbers. When `model.isOverQuota`,
 * an explicit "Over quota" chip sits beside the meter so the state is never a
 * silent in-range-looking ratio.
 */
export function SlotsMeter({ model }: Readonly<SlotsMeterProps>) {
  return (
    <div className="flex flex-col gap-2" data-testid="slots-meter">
      <Meter aria-label="Approved vs slots" color={model.color} maxValue={model.slots} value={model.meterValue}>
        <div className="flex items-center justify-between gap-2">
          <Meter.Output>{model.label}</Meter.Output>
          {model.isOverQuota && (
            <Chip color="danger" size="sm" variant="soft">
              Over quota
            </Chip>
          )}
        </div>
        <Meter.Track>
          <Meter.Fill />
        </Meter.Track>
      </Meter>
    </div>
  );
}
