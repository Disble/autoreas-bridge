import { Alert, Button } from '@heroui/react';
import { DRAWER_ERROR_TITLE, DRAWER_LOADING_LABEL } from '../../drawer/drawer.constants';
import { useActivityDetailDrawer } from '../../drawer/use-activity-detail-drawer';
import { ActivityTechnicalView } from '../ActivityTechnicalView/ActivityTechnicalView';
import { ActivityDrawerHeader } from './ActivityDrawerHeader';
import { ActivityDrawerSkeleton } from './ActivityDrawerSkeleton';
import { ActivityDrawerSummary } from './ActivityDrawerSummary';
import type { ActivityDetailDrawerPanelProps } from './activity-detail-drawer.types';

/**
 * The open drawer: a non-modal panel on the right (384 px, 720 px in the
 * technical view), overlay surface, no rounding and no backdrop, so the feed
 * stays usable behind it. Loading, failure and the resolved body are exclusive.
 */
export function ActivityDetailDrawerPanel({ line, onClose }: ActivityDetailDrawerPanelProps) {
  const drawer = useActivityDetailDrawer(line);

  return (
    <aside
      aria-labelledby="activity-drawer-title"
      className={`fixed inset-y-0 right-0 z-50 flex max-w-[85vw] flex-col gap-5 bg-overlay p-6 text-overlay-foreground shadow-overlay transition-[width] duration-250 ease-[cubic-bezier(.32,.72,0,1)] motion-reduce:transition-none ${drawer.technical ? 'w-[720px]' : 'w-96'}`}
    >
      <ActivityDrawerHeader header={drawer.header} onClose={onClose} onCopy={drawer.copyForAi} onToggleTechnical={drawer.toggleTechnical} technical={drawer.technical} />
      <div className="-mx-6 flex min-h-0 flex-1 flex-col gap-5 overflow-x-hidden overflow-y-auto overscroll-contain px-6 pb-2">
        {drawer.status === 'loading' && (
          <div aria-labelledby="activity-drawer-loading-label" aria-live="polite" role="status">
            <span className="sr-only" id="activity-drawer-loading-label">
              {DRAWER_LOADING_LABEL}
            </span>
            <ActivityDrawerSkeleton />
          </div>
        )}
        {drawer.status === 'failed' && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{DRAWER_ERROR_TITLE}</Alert.Title>
              <Button className="mt-2 self-start" onPress={drawer.retry} size="sm" variant="secondary">
                Try again
              </Button>
            </Alert.Content>
          </Alert>
        )}
        {drawer.status === 'ready' && !drawer.technical && <ActivityDrawerSummary sections={drawer.summary.sections} />}
        {drawer.status === 'ready' && drawer.technical && (
          <ActivityTechnicalView
            data={drawer.data}
            events={drawer.events}
            gaps={drawer.summary.gaps}
            groups={drawer.requestGroups}
            lineFailed={line.failed}
            onPickGroup={drawer.pickGroup}
            onRetryRequest={drawer.retryRequest}
            onSelectTab={drawer.selectTab}
            panel={drawer.requestPanel}
            requestStatus={drawer.requestStatus}
            selectedGroupKey={drawer.selectedGroupKey}
            tab={drawer.tab}
            tabs={drawer.tabs}
          />
        )}
      </div>
    </aside>
  );
}
