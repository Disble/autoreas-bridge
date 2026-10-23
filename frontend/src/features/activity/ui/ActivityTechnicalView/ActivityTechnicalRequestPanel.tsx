import { Chip } from '@heroui/react';
import { CodeBlock } from '../../../../shared/ui/CodeBlock/CodeBlock';
import { ACTIVITY_TECHNICAL_CUT_LABEL } from './activity-technical-view.constants';
import type { ActivityTechnicalRequestPanelProps } from './activity-technical-view.types';

/**
 * The picked request in its own framed panel: a secondary-surface header with
 * the summary line and chips, then Request and Response side by side.
 */
export function ActivityTechnicalRequestPanel({ panel }: ActivityTechnicalRequestPanelProps) {
  return (
    <section aria-label="Selected request" className="flex min-w-0 flex-col overflow-hidden rounded-lg border border-separator">
      <div className="flex flex-wrap items-center gap-2 bg-surface-secondary px-3 py-2 text-xs">
        {panel.summary.map((part, index) => (
          <span className={index === 0 ? 'font-mono font-semibold' : 'text-muted'} key={part}>
            {part}
          </span>
        ))}
        <Chip color={panel.failed ? 'danger' : 'default'} size="sm" variant="soft">
          {panel.status}
        </Chip>
        {panel.notApplied && (
          <Chip color="danger" size="sm" variant="soft">
            not applied
          </Chip>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-3 p-3">
        <div className="flex min-w-0 flex-col gap-1">
          {panel.requestCut && (
            <Chip className="self-start" color="warning" size="sm" variant="soft">
              {ACTIVITY_TECHNICAL_CUT_LABEL}
            </Chip>
          )}
          <CodeBlock label="Request" notice="No request body was captured." raw={panel.requestBody} state={panel.requestBody === '' ? 'not-captured' : 'captured'} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          {panel.responseCut && (
            <Chip className="self-start" color="warning" size="sm" variant="soft">
              {ACTIVITY_TECHNICAL_CUT_LABEL}
            </Chip>
          )}
          <CodeBlock label="Response" notice="No response body was captured." raw={panel.responseBody} state={panel.responseBody === '' ? 'not-captured' : 'captured'} />
        </div>
      </div>
    </section>
  );
}
