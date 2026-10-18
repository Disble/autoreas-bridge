import { Typography } from '@heroui/react';
import { ACTIVITY_TONE_DOT_CLASS } from '../ActivityRunStory/activity-run-story.constants';
import { ACTIVITY_LANE_ROW_CLASS } from './activity-incidents.constants';
import type { ActivityIncidentLanesProps } from './activity-incidents.types';

/**
 * The pinned window as three lanes on one time axis: phone reports, requests
 * and bridge events as positioned markers, failures in color, the triggering
 * fact ringed, and a line at the incident moment. The whole drawing is one
 * image whose text alternative counts what each lane holds.
 */
export function ActivityIncidentLanes({ lanes }: ActivityIncidentLanesProps) {
  return (
    <div aria-label={lanes.summary} className="flex min-w-0 flex-col gap-1" role="img">
      {lanes.lanes.map((lane) => (
        <div className="flex min-w-0 items-center gap-3" key={lane.label}>
          <span className="w-16 shrink-0 text-xs text-muted">{lane.label}</span>
          <div className={ACTIVITY_LANE_ROW_CLASS} data-lane={lane.label}>
            <div className="absolute inset-x-0 top-1/2 h-px bg-separator" />
            {/* Inset by half a ringed marker, so a marker at either edge stays inside the lane. */}
            <div className="absolute inset-y-0 left-2 right-2">
              <div className="absolute inset-y-0 w-px bg-accent/60" style={{ left: `${lanes.occurredPercent}%` }} />
              {lane.markers.map((marker) => (
                <span
                  className={`absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ${ACTIVITY_TONE_DOT_CLASS[marker.tone]} ${marker.isTrigger ? 'ring-2 ring-accent ring-offset-1 ring-offset-background' : ''}`}
                  data-lane-marker={marker.tone}
                  key={marker.key}
                  style={{ left: `${marker.leftPercent}%` }}
                  title={marker.title}
                />
              ))}
            </div>
          </div>
        </div>
      ))}
      <div className="flex min-w-0 items-center gap-3">
        <span className="w-16 shrink-0" />
        <div className="flex min-w-0 flex-1 justify-between">
          <Typography color="muted" type="body-xs">
            {lanes.startLabel}
          </Typography>
          <Typography color="muted" type="body-xs">
            {lanes.endLabel}
          </Typography>
        </div>
      </div>
    </div>
  );
}
