import { Chip, Table } from '@heroui/react';
import { ACTIVITY_TONE_TEXT_CLASS } from '../ActivityRunStory/activity-run-story.constants';
import type { ActivityIncidentRequestsProps } from './activity-incidents.types';

/**
 * "Requests in this window": one row per route and status, polling folded
 * into a single row with its count. Picking a row opens that row's latest
 * request; an empty pick changes nothing.
 */
export function ActivityIncidentRequests({ rows, selectedRequestId, onSelect }: ActivityIncidentRequestsProps) {
  return (
    <Table aria-label="Requests in this window" variant="secondary">
      <Table.ScrollContainer>
        <Table.Content
          aria-label="Requests in this window"
          className="w-full min-w-[32rem] table-fixed"
          onSelectionChange={onSelect}
          selectedKeys={selectedRequestId === '' ? [] : [selectedRequestId]}
          selectionMode="single"
        >
          <Table.Header>
            <Table.Column className="w-32">Time</Table.Column>
            <Table.Column isRowHeader>Route</Table.Column>
            <Table.Column className="w-16">Status</Table.Column>
            <Table.Column className="w-20 text-right">Slowest</Table.Column>
          </Table.Header>
          <Table.Body renderEmptyState={() => <span className="block py-3 text-sm text-muted">No request was captured in this window.</span>}>
            {rows.map((row) => (
              <Table.Row data-trigger-row={row.isTrigger ? 'true' : undefined} id={row.requestId} key={row.requestId}>
                <Table.Cell>
                  <span className="font-mono text-xs tabular-nums">{row.time}</span>
                </Table.Cell>
                <Table.Cell>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="min-w-0 truncate font-mono text-xs">{row.route}</span>
                    {row.countLabel === '' ? null : (
                      <Chip size="sm" variant="soft">
                        {row.countLabel}
                      </Chip>
                    )}
                    {row.isTrigger ? (
                      <Chip color="danger" size="sm" variant="soft">
                        Trigger
                      </Chip>
                    ) : null}
                  </span>
                </Table.Cell>
                <Table.Cell>
                  <span className={`text-xs tabular-nums ${ACTIVITY_TONE_TEXT_CLASS[row.statusTone]}`}>{row.status}</span>
                </Table.Cell>
                <Table.Cell>
                  <span className="block text-right text-xs tabular-nums text-muted">{row.duration}</span>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}
