import { ActivityDrawerFacts } from '../ActivityDetailDrawer/ActivityDrawerSectionBlocks';
import type { ActivityTechnicalWindowErrorProps } from './activity-technical-view.types';

/**
 * The Data tab of a window error: kind, page, source and time, then the
 * message and the stack trace, each as `ReportFrontendError` stored it. No
 * "Cut at 8 KB" chip: the report does not record whether the stack was cut.
 */
export function ActivityTechnicalWindowError({ detail }: ActivityTechnicalWindowErrorProps) {
  return (
    <section aria-label="Window error" className="flex min-w-0 flex-col gap-4">
      <ActivityDrawerFacts section={{ kind: 'facts', key: 'window-error', title: '', rows: detail.facts }} />
      <section aria-label="Message" className="flex min-w-0 flex-col gap-2">
        <h3 className="text-xs font-medium text-muted">Message</h3>
        <pre className="overflow-x-auto rounded-lg bg-surface-secondary p-3 font-mono text-xs whitespace-pre-wrap">{detail.message}</pre>
      </section>
      {detail.stack !== '' && (
        <section aria-label="Stack trace" className="flex min-w-0 flex-col gap-2">
          <h3 className="text-xs font-medium text-muted">Stack trace</h3>
          <pre className="overflow-x-auto rounded-lg bg-surface-secondary p-3 font-mono text-xs">{detail.stack}</pre>
        </section>
      )}
    </section>
  );
}
