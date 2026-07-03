import { Card, Chip, Spinner } from '@heroui/react';
import { Link } from 'react-router';
import {
  HISTORY_LIST_EMPTY_MESSAGE,
  HISTORY_LIST_EMPTY_TITLE,
  HISTORY_LIST_LABEL,
} from './history-list.constants';
import { formatHistoryRepetitionCountLabel } from './history-list.helpers';
import type { HistoryListProps } from './history-list.types';
import { useHistoryList } from './use-history-list';

/** Read-only History lens: progress + repetition-timeline context per anime. */
export function HistoryList(props: Readonly<HistoryListProps>) {
  const { items, isLoading, isEmpty } = useHistoryList(props);

  return (
    <Card className={props.className}>
      <Card.Content className="flex flex-col gap-4">
        {isLoading ? (
          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-4 py-5 text-sm text-muted">
            <Spinner size="sm" />
            <span>Loading history...</span>
          </div>
        ) : null}

        {isEmpty ? (
          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-5 py-8 text-center">
            <p className="text-sm font-medium text-foreground">{HISTORY_LIST_EMPTY_TITLE}</p>
            <p className="mt-2 text-sm text-muted">{HISTORY_LIST_EMPTY_MESSAGE}</p>
          </div>
        ) : null}

        {!isLoading && !isEmpty ? (
          <menu
            aria-label={HISTORY_LIST_LABEL}
            className="flex max-h-[28rem] flex-col gap-3 overflow-y-auto pr-1"
          >
            {items.map((item) => (
              <li
                className="rounded-2xl border border-white/10 bg-white/[0.02] px-4 py-4 transition-colors hover:bg-white/[0.04]"
                key={item.id}
              >
                <Link className="block min-w-0" to={`/catalog/detail/${item.id}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-sm font-semibold text-foreground">{item.nombre}</h3>
                      <p className="mt-1 text-xs text-muted">{item.progressLabel}</p>
                    </div>
                    <Chip color="default" size="sm" variant="soft">
                      <Chip.Label>{formatHistoryRepetitionCountLabel(item.repetitionCount)}</Chip.Label>
                    </Chip>
                  </div>
                  {item.repetitionCount > 0 ? (
                    <ul className="mt-2 flex flex-col gap-1">
                      {item.repetitions.map((entry) => (
                        <li className="text-xs text-muted" key={entry.key}>
                          Repetition {entry.numRepeticion} — {entry.repeatedOnLabel}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </Link>
              </li>
            ))}
          </menu>
        ) : null}
      </Card.Content>
    </Card>
  );
}
