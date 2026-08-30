import { Alert, Card, Chip, Table, Typography } from '@heroui/react';
import { getNetworkDomainColor, getNetworkLevelColor } from '../NetworkPanel/network-panel.helpers';
import {
  OVERVIEW_EVENT_SAMPLES_TITLE,
  OVERVIEW_EVENT_SUMMARY_DESCRIPTION,
  OVERVIEW_EVENT_SUMMARY_TITLE,
  OVERVIEW_PARITY_NOTE,
  OVERVIEW_REQUEST_HEALTH_TITLE,
  OVERVIEW_UNMEASURED_DESCRIPTION,
} from './activity-overview.constants';
import type { ActivityOverviewProps } from './activity-overview.types';
import { useActivityOverview } from './use-activity-overview';

/**
 * ActivityOverview is the aggregate surface inside Activity: captured-request
 * health grouped by route/status/outcome, and persisted runtime-event counts
 * grouped by domain, level and event type. It is the desktop equivalent of the
 * MCP's `summary_requests` and `summary_events`, so a human can ask "which
 * routes are failing, how often" without an agent.
 *
 * The two aggregations stay side by side rather than merged: the stores are
 * keyed on different values, so a combined correlation timeline would render an
 * empty request side by construction. All data flows from `useActivityOverview`;
 * this component only renders.
 */
export function ActivityOverview({ captureSource, eventSource }: Readonly<ActivityOverviewProps>) {
  const {
    requestRows,
    requestCount,
    requestStatusMessage,
    requestEmptyMessage,
    eventSections,
    eventSamples,
    eventStatusMessage,
    eventEmptyMessage,
  } = useActivityOverview(captureSource, eventSource);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[11px] text-muted">{OVERVIEW_PARITY_NOTE}</p>

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
            <Table aria-label="Request health" variant="secondary">
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
                    {requestRows.map((row) => (
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
          )}
        </Card.Content>
      </Card>

      <Card>
        <Card.Header>
          <Card.Title>{OVERVIEW_EVENT_SUMMARY_TITLE}</Card.Title>
          <Card.Description>
            {eventStatusMessage === null ? OVERVIEW_EVENT_SUMMARY_DESCRIPTION : OVERVIEW_UNMEASURED_DESCRIPTION}
          </Card.Description>
        </Card.Header>
        <Card.Content className="flex flex-col gap-4">
          {eventStatusMessage !== null ? (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{eventStatusMessage}</Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <>
              <div className="grid gap-4 lg:grid-cols-3">
                {eventSections.map((section) => (
                  <section className="flex min-w-0 flex-col gap-2" key={section.id}>
                    <Typography type="h6">{section.title}</Typography>
                    <Table aria-label={section.title} variant="secondary">
                      <Table.ScrollContainer>
                        <Table.Content aria-label={section.title} className="w-full table-fixed">
                          <Table.Header>
                            <Table.Column isRowHeader>Key</Table.Column>
                            <Table.Column className="w-[72px]">Count</Table.Column>
                            <Table.Column className="w-[72px]">Share</Table.Column>
                          </Table.Header>
                          <Table.Body
                            renderEmptyState={() => <span className="text-sm text-muted">{eventEmptyMessage}</span>}
                          >
                            {section.rows.map((row) => (
                              <Table.Row id={row.key} key={row.key}>
                                <Table.Cell>
                                  <span className="block truncate text-foreground" title={row.label}>
                                    {row.label}
                                  </span>
                                </Table.Cell>
                                <Table.Cell>
                                  <span className="font-mono text-[11px] text-foreground">{row.count}</span>
                                </Table.Cell>
                                <Table.Cell>
                                  <span className="font-mono text-[11px] text-muted">{row.shareLabel}</span>
                                </Table.Cell>
                              </Table.Row>
                            ))}
                          </Table.Body>
                        </Table.Content>
                      </Table.ScrollContainer>
                    </Table>
                  </section>
                ))}
              </div>

              <section className="flex min-w-0 flex-col gap-2">
                <Typography type="h6">{OVERVIEW_EVENT_SAMPLES_TITLE}</Typography>
                <ul className="flex flex-col gap-1">
                  {eventSamples.map((sample) => (
                    <li className="flex min-w-0 items-center gap-2 text-[11px]" key={sample.id}>
                      <span className="shrink-0 font-mono text-muted">{sample.timeLabel}</span>
                      <Chip color={getNetworkDomainColor(sample.domain)} size="sm" variant="soft">
                        {sample.domain}
                      </Chip>
                      <Chip color={getNetworkLevelColor(sample.level)} size="sm" variant="soft">
                        {sample.level}
                      </Chip>
                      <span className="min-w-0 flex-1 truncate text-foreground" title={sample.message}>
                        {sample.message}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </Card.Content>
      </Card>
    </div>
  );
}
