import { Chip } from '@heroui/react';
import { Icon } from '@iconify/react';
import chevronIcon from '@iconify-icons/solar/alt-arrow-right-bold';
import type {
  ActivityDrawerBeforeAfterProps,
  ActivityDrawerCauseProps,
  ActivityDrawerFactsProps,
  ActivityDrawerListProps,
  ActivityDrawerStatsProps,
} from './activity-detail-drawer.types';

/** The before and after values of a change, with an arrow between them. */
export function ActivityDrawerBeforeAfter({ section }: ActivityDrawerBeforeAfterProps) {
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
      <div className="flex flex-col gap-1 rounded-lg bg-surface-secondary p-3">
        <small className="text-xs text-muted">Before</small>
        <b className="truncate text-xl font-semibold">{section.before}</b>
      </div>
      <Icon className="text-muted" icon={chevronIcon} />
      <div className="flex flex-col gap-1 rounded-lg bg-surface-secondary p-3">
        <small className="text-xs text-muted">After</small>
        <b className="truncate text-xl font-semibold">{section.after}</b>
      </div>
    </div>
  );
}

/** The figures of a stats section; failing figures show in red. */
export function ActivityDrawerStats({ section }: ActivityDrawerStatsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {section.items.map((item) => (
        <div className="flex flex-col gap-1 rounded-lg bg-surface-secondary p-3" key={item.key}>
          <b className={`text-xl font-semibold tabular-nums ${item.failed ? 'text-danger' : ''}`}>{item.value}</b>
          <small className="text-xs text-muted">{item.label}</small>
        </div>
      ))}
    </div>
  );
}

/** The label and value rows of a facts section, each with its optional warning chip. */
export function ActivityDrawerFacts({ section }: ActivityDrawerFactsProps) {
  return (
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
      {section.rows.map((row) => (
        <div className="contents" key={row.key}>
          <dt className={`text-muted ${row.mono ? 'font-mono text-xs' : ''}`}>{row.label}</dt>
          <dd className={`flex min-w-0 flex-wrap items-center gap-2 break-words ${row.mono ? 'font-mono text-xs' : ''}`}>
            {row.value}
            {row.warnChip !== undefined && (
              <Chip color="warning" size="sm" variant="soft">
                {row.warnChip}
              </Chip>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** The cause of a failure: its sentence, else the recorded message, and its code chip. */
export function ActivityDrawerCause({ section }: ActivityDrawerCauseProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-surface-secondary p-3">
      {section.cause.sentence === undefined && <small className="text-xs text-muted">Recorded message</small>}
      <p className="text-sm break-words">{section.cause.sentence ?? section.cause.recordedMessage}</p>
      {section.cause.code !== '' && (
        <Chip className="self-start font-mono" size="sm" variant="soft">
          {section.cause.code}
        </Chip>
      )}
    </div>
  );
}

/** The timed rows of a list section; failed rows show in red. */
export function ActivityDrawerList({ section }: ActivityDrawerListProps) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {section.items.map((item) => (
        <li className="flex gap-3" key={item.key}>
          <span className="shrink-0 text-muted tabular-nums">{item.time}</span>
          <span className={`min-w-0 break-words ${item.failed ? 'text-danger' : ''}`}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
