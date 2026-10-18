import { Card } from '@heroui/react';
import { ActivityIncidentDetailPane } from './ActivityIncidentDetailPane';
import { ActivityIncidentListPane } from './ActivityIncidentListPane';
import { ActivityWhereFilter } from './ActivityWhereFilter';
import type { ActivityIncidentsProps } from './activity-incidents.types';
import { useActivityIncidents } from './use-activity-incidents';

/**
 * The Incidents tab, "what went wrong, and why?": the where filter, the list
 * of the last 7 days beside the detail pane. The list's loading, failure,
 * empty and resolved states are exclusive; the pane rests until a pick.
 */
export function ActivityIncidents({ openRequest }: ActivityIncidentsProps) {
  const { where, list, entries, visibleCount, scrollRef, onScroll, selection, selectedKey, isFiltered, selectWhere, clearFilter, select, retry } =
    useActivityIncidents(openRequest);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <ActivityWhereFilter onChange={selectWhere} where={where} />
      <div className="grid min-w-0 gap-4 md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <Card.Content className="min-w-0 p-1">
            <ActivityIncidentListPane
              entries={entries}
              isFiltered={isFiltered}
              onClearFilter={clearFilter}
              onRetry={retry}
              onScroll={onScroll}
              onSelect={select}
              scrollRef={scrollRef}
              selectedKey={selectedKey}
              status={list.status}
              visibleCount={visibleCount}
            />
          </Card.Content>
        </Card>
        <Card className="min-w-0">
          <Card.Content className="min-w-0">
            <ActivityIncidentDetailPane selection={selection} />
          </Card.Content>
        </Card>
      </div>
    </div>
  );
}
