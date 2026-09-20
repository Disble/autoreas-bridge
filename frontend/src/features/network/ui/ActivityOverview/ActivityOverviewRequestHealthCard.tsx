import { Alert, Card, Chip, Table } from '@heroui/react';
import {
  OVERVIEW_LOADING_MESSAGE,
  OVERVIEW_REQUEST_SKELETON_COLUMN_WIDTHS,
  OVERVIEW_REQUEST_HEALTH_TITLE,
  OVERVIEW_SKELETON_ROW_COUNT,
  OVERVIEW_UNMEASURED_DESCRIPTION,
} from './activity-overview.constants';
import type { ActivityOverviewRequestHealthCardProps } from './activity-overview.types';
import { buildActivityOverviewSkeletonRows } from './ActivityOverviewSkeletonRows';

/**
 * ActivityOverviewRequestHealthCard renders the captured-request health
 * aggregation: the header with its measured count line, the degraded-store
 * disclosure, and the (route, status, outcome) count table with its bounded
 * recent-error references. It is the desktop peer of the MCP's
 * `summary_requests`.
 *
 * While the aggregation is unresolved, the table keeps its header and swaps in
 * skeleton rows instead of the real ones, and is marked `aria-busy`. A
 * `role="status"` region cannot nest inside table markup, so one sits as a
 * sibling of the table naming what is loading.
 *
 * All data arrives through props from `useActivityOverview`; this component
 * only renders.
 */
export function ActivityOverviewRequestHealthCard({
  isLoading,
  requestRows,
  requestCount,
  requestStatusMessage,
  requestEmptyMessage,
}: Readonly<ActivityOverviewRequestHealthCardProps>) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{OVERVIEW_REQUEST_HEALTH_TITLE}</Card.Title>
        <Card.Description>
          {requestStatusMessage === null
            ? `${requestCount} captured requests across ${requestRows.length} route/status/outcome groups`
            : OVERVIEW_UNMEASURED_DESCRIPTION}
        </Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {requestStatusMessage !== null ? (
          <Alert status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{requestStatusMessage}</Alert.Description>
            </Alert.Content>
          </Alert>
        ) : (
          <>
            {isLoading ? (
              <div aria-labelledby="activity-overview-request-loading-label" aria-live="polite" className="sr-only" role="status">
                <span id="activity-overview-request-loading-label">{OVERVIEW_LOADING_MESSAGE}</span>
              </div>
            ) : null}
            <Table aria-busy={isLoading} aria-label="Request health" variant="secondary">
              <Table.ScrollContainer>
                <Table.Content aria-label="Request health" className="w-full table-fixed">
                  <Table.Header>
                    <Table.Column isRowHeader>Route</Table.Column>
                    <Table.Column className="w-[104px]">Status</Table.Column>
                    <Table.Column className="w-[128px]">Outcome</Table.Column>
                    <Table.Column className="w-[88px]">Count</Table.Column>
                    <Table.Column className="w-[200px]">Latest errors</Table.Column>
                  </Table.Header>
                  <Table.Body renderEmptyState={() => <span className="text-sm text-muted">{requestEmptyMessage}</span>}>
                    {isLoading
                      ? buildActivityOverviewSkeletonRows({
                          columnWidths: OVERVIEW_REQUEST_SKELETON_COLUMN_WIDTHS,
                          idPrefix: 'activity-overview-request-skeleton',
                          rowCount: OVERVIEW_SKELETON_ROW_COUNT,
                          testId: 'activity-overview-request-skeleton-row',
                        })
                      : requestRows.map((row) => (
                          <Table.Row id={row.id} key={row.id}>
                            <Table.Cell>
                              <span className="block truncate text-foreground" title={row.route}>
                                {row.route}
                              </span>
                            </Table.Cell>
                            <Table.Cell>
                              <span className="font-mono text-[11px] text-muted">{row.statusLabel}</span>
                            </Table.Cell>
                            <Table.Cell>
                              <span className="block truncate text-muted">{row.outcome}</span>
                            </Table.Cell>
                            <Table.Cell>
                              <span className="font-mono text-[11px] text-foreground">{row.count}</span>
                            </Table.Cell>
                            <Table.Cell>
                              <div className="flex flex-wrap gap-1">
                                {row.errorSamples.map((sample) => (
                                  <Chip color="danger" key={sample.requestId} size="sm" variant="soft">
                                    {sample.errorCode}
                                  </Chip>
                                ))}
                              </div>
                            </Table.Cell>
                          </Table.Row>
                        ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
