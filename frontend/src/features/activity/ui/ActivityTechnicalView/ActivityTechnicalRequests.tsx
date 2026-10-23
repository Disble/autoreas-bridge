import { Alert, Button, Chip, ListBox, Skeleton } from '@heroui/react';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { DRAWER_REQUESTS_EMPTY_FINE, DRAWER_REQUESTS_EMPTY_TITLE, DRAWER_REQUESTS_EMPTY_UNPINNED } from '../../drawer/drawer.constants';
import { ActivityTechnicalRequestPanel } from './ActivityTechnicalRequestPanel';
import { ACTIVITY_TECHNICAL_REQUEST_LOADING_LABEL } from './activity-technical-view.constants';
import type { ActivityTechnicalRequestsProps } from './activity-technical-view.types';

/**
 * The Requests tab: the retention empty state when nothing was kept, the
 * route-and-status picker only when there are two or more groups, then the
 * picked request in its framed panel.
 */
export function ActivityTechnicalRequests({ lineFailed, groups, selectedGroupKey, onPickGroup, requestStatus, panel, onRetryRequest }: ActivityTechnicalRequestsProps) {
  if (groups.length === 0) {
    return <AirisEmptyState description={lineFailed ? DRAWER_REQUESTS_EMPTY_UNPINNED : DRAWER_REQUESTS_EMPTY_FINE} kind="caught-up" size="section" title={DRAWER_REQUESTS_EMPTY_TITLE} />;
  }
  return (
    <div className="flex min-w-0 flex-col gap-3">
      {groups.length > 1 && (
        <ListBox
          aria-label="Requests"
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
            <ListBox.Item id={group.key} key={group.key} textValue={`${group.route} ${group.status}`}>
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{group.route}</span>
              <Chip color={group.failed ? 'danger' : 'default'} size="sm" variant="soft">
                {group.status}
              </Chip>
              <span className="text-xs text-muted tabular-nums">×{group.count}</span>
              <span className="text-xs text-muted tabular-nums">{group.latestTime}</span>
            </ListBox.Item>
          ))}
        </ListBox>
      )}
      {requestStatus === 'loading' && (
        <div aria-labelledby="activity-technical-request-loading-label" aria-live="polite" role="status">
          <span className="sr-only" id="activity-technical-request-loading-label">
            {ACTIVITY_TECHNICAL_REQUEST_LOADING_LABEL}
          </span>
          <Skeleton className="h-40 w-full rounded-lg" />
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
      {requestStatus === 'gone' && <AirisEmptyState description="Its full capture aged out of the Recorder." kind="caught-up" size="section" title={DRAWER_REQUESTS_EMPTY_TITLE} />}
      {requestStatus === 'ready' && panel !== undefined && <ActivityTechnicalRequestPanel panel={panel} />}
    </div>
  );
}
