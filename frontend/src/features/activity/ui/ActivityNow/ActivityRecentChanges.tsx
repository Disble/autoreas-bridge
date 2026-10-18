import { Typography } from '@heroui/react';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { ACTIVITY_NOW_LIST_ROW_CLASS } from './activity-now.constants';
import type { ActivityRecentChangesProps } from './activity-now.types';

/** The newest writes in plain words: the anime as stored, then what changed and who changed it. */
export function ActivityRecentChanges({ changes }: ActivityRecentChangesProps) {
  return (
    <section aria-labelledby="activity-recent-changes" className="flex min-w-0 flex-col gap-2">
      <Typography id="activity-recent-changes" type="h3">
        Recent changes
      </Typography>
      {changes.length === 0 ? (
        <AirisEmptyState description="Writes from the phone and the bridge show here." kind="caught-up" size="row" title="No recent changes" />
      ) : (
        <ul className="flex flex-col">
          {changes.map((change) => (
            <li className={ACTIVITY_NOW_LIST_ROW_CLASS} key={change.key}>
              <span className="min-w-0 truncate text-sm text-foreground">{change.animeName}</span>
              <span className="min-w-0 truncate text-sm text-muted">{change.description}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
