import { Alert, Button, Chip, Skeleton, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { ActivityDrawerFacts } from '../ActivityDetailDrawer/ActivityDrawerSectionBlocks';
import {
  ACTIVITY_TECHNICAL_CODE_CLASS,
  ACTIVITY_TECHNICAL_OCCURRENCE_ERROR_TITLE,
  ACTIVITY_TECHNICAL_OCCURRENCE_LOADING_LABEL,
  ACTIVITY_TECHNICAL_SEGMENT_BUTTON_CLASS,
  ACTIVITY_TECHNICAL_SEGMENT_CLASS,
  ACTIVITY_TECHNICAL_STACK_CUT_LABEL,
} from './activity-technical-view.constants';
import type { ActivityTechnicalWindowErrorProps } from './activity-technical-view.types';

/**
 * The Data tab of a window error: the occurrence picker when it repeated, then
 * kind, page, source and time, the message and the stack trace, each as
 * `ReportFrontendError` stored it. A stack at the report limit carries the
 * "Cut at 8 KB" chip. A picked occurrence shows loading and failure states of its own.
 */
export function ActivityTechnicalWindowError({ detail, occurrences, selectedOccurrenceId, occurrenceStatus, onPickOccurrence, onRetryOccurrence }: ActivityTechnicalWindowErrorProps) {
  return (
    <section aria-label="Window error" className="flex min-w-0 flex-col gap-5">
      {occurrences.length > 0 && (
        <ToggleButtonGroup
          aria-label="Occurrence"
          className={ACTIVITY_TECHNICAL_SEGMENT_CLASS}
          disallowEmptySelection
          isDetached
          onSelectionChange={(keys) => onPickOccurrence(Number([...keys][0]))}
          selectedKeys={selectedOccurrenceId === undefined ? [] : [String(selectedOccurrenceId)]}
          selectionMode="single"
          size="sm"
        >
          {occurrences.map((occurrence) => (
            <ToggleButton className={ACTIVITY_TECHNICAL_SEGMENT_BUTTON_CLASS} id={String(occurrence.id)} key={occurrence.id} variant="ghost">
              {occurrence.time}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      )}
      {occurrenceStatus === 'loading' && (
        <div aria-busy="true" aria-labelledby="activity-occurrence-loading" aria-live="polite" className="flex flex-col gap-2" role="status">
          <span className="sr-only" id="activity-occurrence-loading">
            {ACTIVITY_TECHNICAL_OCCURRENCE_LOADING_LABEL}
          </span>
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
      )}
      {occurrenceStatus === 'failed' && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{ACTIVITY_TECHNICAL_OCCURRENCE_ERROR_TITLE}</Alert.Title>
            <Button size="sm" variant="tertiary" onPress={onRetryOccurrence}>
              Try again
            </Button>
          </Alert.Content>
        </Alert>
      )}
      {occurrenceStatus === 'ready' && detail !== undefined && (
        <>
          <ActivityDrawerFacts section={{ kind: 'facts', key: 'window-error', title: '', rows: detail.facts }} />
          <section aria-label="Message" className="flex min-w-0 flex-col gap-2">
            <h3 className="text-[13px] font-medium text-muted">Message</h3>
            <pre className={`${ACTIVITY_TECHNICAL_CODE_CLASS} whitespace-pre-wrap`}>{detail.message}</pre>
          </section>
          {detail.stack !== '' && (
            <section aria-label="Stack trace" className="flex min-w-0 flex-col gap-2">
              <h3 className="flex items-center gap-2 text-[13px] font-medium text-muted">
                Stack trace
                {detail.stackCut && (
                  <Chip className="h-auto rounded-full px-[7px] py-px text-[11px] font-normal" color="warning" size="sm" variant="soft">
                    {ACTIVITY_TECHNICAL_STACK_CUT_LABEL}
                  </Chip>
                )}
              </h3>
              <pre className={ACTIVITY_TECHNICAL_CODE_CLASS}>{detail.stack}</pre>
            </section>
          )}
        </>
      )}
    </section>
  );
}
