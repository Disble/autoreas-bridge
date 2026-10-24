import { Alert, Button, ListBox, Skeleton } from '@heroui/react';
import { DRAWER_REQUESTS_EMPTY_FINE, DRAWER_REQUESTS_EMPTY_TITLE, DRAWER_REQUESTS_EMPTY_UNPINNED } from '../../drawer/drawer.constants';
import { ActivityTechnicalEmpty } from './ActivityTechnicalEmpty';
import { ActivityTechnicalRequestPanel } from './ActivityTechnicalRequestPanel';
import {
  ACTIVITY_TECHNICAL_FAILED_CHIP_CLASS,
  ACTIVITY_TECHNICAL_REQUEST_LOADING_LABEL,
  ACTIVITY_TECHNICAL_REQUEST_ROW_CLASS,
  ACTIVITY_TECHNICAL_STATUS_CHIP_CLASS,
} from './activity-technical-view.constants';
import type { ActivityTechnicalRequestsProps } from './activity-technical-view.types';

/**
 * The Requests tab: the retention empty state when nothing was kept, the
 * route-and-status picker only when there are two or more groups, then the
 * picked request in its framed panel.
 */
export function ActivityTechnicalRequests({ lineFailed, groups, selectedGroupKey, onPickGroup, requestStatus, panel, onRetryRequest }: ActivityTechnicalRequestsProps) {
  if (groups.length === 0) {
    return <ActivityTechnicalEmpty description={lineFailed ? DRAWER_REQUESTS_EMPTY_UNPINNED : DRAWER_REQUESTS_EMPTY_FINE} title={DRAWER_REQUESTS_EMPTY_TITLE} />;
  }
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {groups.length > 1 && (
        <ListBox
          aria-label="Requests"
          className="gap-0.5 p-0"
          onSelectionChange={(keys) => {
            if (keys !== 'all') {
              const [key] = [...keys];
              if (key !== undefined) {
                onPickGroup(String(key));
              }
            }
          }}
          selectedKeys={selectedGroupKey === undefined ? [] : [selectedGroupKey]}
          selectionMode="single"
        >
          {groups.map((group) => (
            <ListBox.Item className={ACTIVITY_TECHNICAL_REQUEST_ROW_CLASS} id={group.key} key={group.key} textValue={`${group.route} ${group.status}`}>
              <span className="min-w-0 truncate font-mono">{group.route}</span>
              <span className={`justify-self-end ${group.failed ? ACTIVITY_TECHNICAL_FAILED_CHIP_CLASS : ACTIVITY_TECHNICAL_STATUS_CHIP_CLASS}`}>{group.status}</span>
              <span className="justify-self-end rounded-full bg-default px-2 py-px text-xs text-muted tabular-nums">×{group.count}</span>
              <span className="text-right text-muted tabular-nums">{group.latestTime}</span>
            </ListBox.Item>
          ))}
        </ListBox>
      )}
      {requestStatus === 'loading' && (
        <div aria-labelledby="activity-technical-request-loading-label" aria-live="polite" role="status">
          <span className="sr-only" id="activity-technical-request-loading-label">
            {ACTIVITY_TECHNICAL_REQUEST_LOADING_LABEL}
          </span>
          <Skeleton className="mt-1 h-40 w-full rounded-2xl" />
        </div>
      )}
      {requestStatus === 'failed' && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>The request could not be read</Alert.Title>
            <Button className="mt-2 self-start" onPress={onRetryRequest} size="sm" variant="secondary">
              Try again
            </Button>
          </Alert.Content>
        </Alert>
      )}
      {requestStatus === 'gone' && <ActivityTechnicalEmpty description="Its full capture aged out of the Recorder." title={DRAWER_REQUESTS_EMPTY_TITLE} />}
      {requestStatus === 'ready' && panel !== undefined && <ActivityTechnicalRequestPanel panel={panel} />}
    </div>
  );
}
