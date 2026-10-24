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
import { ACTIVITY_DRAWER_FAILED_TEXT_CLASS } from './activity-detail-drawer.constants';

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
    <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      {section.rows.map((row) => (
        <div className="contents" key={row.key}>
          <dt className="text-muted">{row.label}</dt>
          <dd className="flex min-w-0 flex-wrap items-center justify-end gap-x-1.5 gap-y-1 text-right tabular-nums [overflow-wrap:anywhere]">
            <span className={row.mono ? 'font-mono text-xs' : ''}>{row.value}</span>
            {row.note !== undefined && <span className="font-mono text-muted">{row.note}</span>}
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
    <div className="flex flex-col rounded-xl bg-[color-mix(in_oklab,var(--danger)_12%,transparent)] px-3.5 py-3 text-sm leading-[1.45]">
      {section.cause.sentence === undefined && <small className="mb-1 text-xs text-muted">Recorded message</small>}
      <p className={section.cause.sentence === undefined ? 'font-mono text-[13px] [overflow-wrap:anywhere]' : 'break-words'}>{section.cause.sentence ?? section.cause.recordedMessage}</p>
      {section.cause.code !== '' && (
        <span className="mt-2 self-start rounded-full bg-[color-mix(in_oklab,var(--foreground)_8%,transparent)] px-2 py-px font-mono text-xs text-muted">{section.cause.code}</span>
      )}
    </div>
  );
}

/** The timed rows of a list section; failed rows show in red. */
export function ActivityDrawerList({ section }: ActivityDrawerListProps) {
  return (
    <ul className="flex flex-col">
      {section.items.map((item) => (
        <li className="grid grid-cols-[52px_minmax(0,1fr)] gap-2.5 py-2 text-sm [&+&]:shadow-[0_-1px_0_var(--separator)]" key={item.key}>
          <span className="text-[13px] text-muted tabular-nums">{item.time}</span>
          <span className={`min-w-0 break-words ${item.failed ? ACTIVITY_DRAWER_FAILED_TEXT_CLASS : ''}`}>{item.text}</span>
        </li>
      ))}
    </ul>
  );
}
