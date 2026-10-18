import { Button, Chip, Typography } from '@heroui/react';
import { Icon } from '@iconify/react';
import clockIcon from '@iconify-icons/solar/clock-circle-bold';
import dangerIcon from '@iconify-icons/solar/danger-circle-bold';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ACTIVITY_NOW_LIST_ROW_CLASS } from './activity-now.constants';
import type { ActivityNeedsALookProps } from './activity-now.types';

/**
 * The open incidents Go picked, errors and new ones first. Each row opens its
 * incident; an error carries the danger mark, a slow call the warning clock.
 */
export function ActivityNeedsALook({ incidents, onOpenIncident }: ActivityNeedsALookProps) {
  return (
    <section aria-labelledby="activity-needs-a-look" className="flex min-w-0 flex-col gap-2">
      <Typography id="activity-needs-a-look" type="h3">
        Needs a look
      </Typography>
      {incidents.length === 0 ? (
        <AirisEmptyState description="Errors and slow calls show here when they happen." kind="caught-up" size="row" title="Nothing needs a look" />
      ) : (
        <ul className="flex flex-col">
          {incidents.map((incident) => (
            <li key={incident.latestId}>
              <Button className={`${ACTIVITY_NOW_LIST_ROW_CLASS} w-full justify-start`} onPress={() => onOpenIncident(incident.latestId)} variant="ghost">
                <span aria-hidden className={incident.isError ? 'flex shrink-0 text-danger' : 'flex shrink-0 text-warning'} data-incident-mark>
                  <Icon icon={incident.isError ? dangerIcon : clockIcon} />
                </span>
                <span className="min-w-0 flex-1 truncate text-left">{incident.title}</span>
                {incident.isNew ? (
                  <Chip color="accent" size="sm" variant="soft">
                    New
                  </Chip>
                ) : null}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
