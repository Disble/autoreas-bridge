import { ActivityTechnicalHeaders } from './ActivityTechnicalHeaders';
import { ActivityTechnicalJson } from './ActivityTechnicalJson';
import {
  ACTIVITY_TECHNICAL_CUT_LABEL,
  ACTIVITY_TECHNICAL_FAILED_CHIP_CLASS,
  ACTIVITY_TECHNICAL_STATUS_CHIP_CLASS,
  ACTIVITY_TECHNICAL_TRUNC_CHIP_CLASS,
} from './activity-technical-view.constants';
import type { ActivityTechnicalRequestPanelProps } from './activity-technical-view.types';

/**
 * The picked request in its own framed panel (`.ax-rq-panel`): a secondary
 * summary bar, then Request and Response side by side, each with its stored
 * headers and its body in the dark
 * code box with its keys and strings coloured. The status chip sits on the
 * Response heading and a cut body carries the 64 KB chip, as the mockup draws them.
 */
export function ActivityTechnicalRequestPanel({ panel }: ActivityTechnicalRequestPanelProps) {
  return (
    <section aria-label="Selected request" className="mt-1 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border">
      <div className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-surface-secondary px-4 py-3 text-[13px] text-muted">
        {panel.summary.map((part, index) => (
          <span className={index === 0 ? 'font-mono font-medium text-foreground' : ''} key={part}>
            {part}
          </span>
        ))}
        {panel.notApplied && <span className={ACTIVITY_TECHNICAL_FAILED_CHIP_CLASS}>not applied</span>}
      </div>
      <div className="grid min-w-0 grid-cols-2 gap-4 p-4">
        <div className="flex min-w-0 flex-col gap-2.5">
          <h4 className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            Request
            {panel.requestCut && <span className={ACTIVITY_TECHNICAL_TRUNC_CHIP_CLASS}>{ACTIVITY_TECHNICAL_CUT_LABEL}</span>}
          </h4>
          <ActivityTechnicalHeaders headers={panel.requestHeaders} label="Request headers" />
          {panel.requestBody === '' ? <p className="text-xs text-muted">No request body was captured.</p> : <ActivityTechnicalJson raw={panel.requestBody} />}
        </div>
        <div className="flex min-w-0 flex-col gap-2.5">
          <h4 className="flex items-center gap-2 text-[13px] font-medium text-foreground">
            Response
            <span className={panel.failed ? ACTIVITY_TECHNICAL_FAILED_CHIP_CLASS : ACTIVITY_TECHNICAL_STATUS_CHIP_CLASS}>{panel.status}</span>
            {panel.responseCut && <span className={ACTIVITY_TECHNICAL_TRUNC_CHIP_CLASS}>{ACTIVITY_TECHNICAL_CUT_LABEL}</span>}
          </h4>
          <ActivityTechnicalHeaders headers={panel.responseHeaders} label="Response headers" />
          {panel.responseBody === '' ? <p className="text-xs text-muted">No response body was captured.</p> : <ActivityTechnicalJson raw={panel.responseBody} />}
        </div>
      </div>
    </section>
  );
}
