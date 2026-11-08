import { Alert, Button, ListBox, Skeleton } from '@heroui/react';
import { DRAWER_REPORTS_TITLE, DRAWER_STORED_REPORT_LABEL } from '../../drawer/drawer.constants';
import { useDrawerReportWindow } from '../../drawer/use-drawer-report-window';
import { ActivityTechnicalEmpty } from './ActivityTechnicalEmpty';
import { ActivityTechnicalJson } from './ActivityTechnicalJson';
import {
  ACTIVITY_TECHNICAL_REPORT_ERROR_TITLE,
  ACTIVITY_TECHNICAL_REPORT_GONE,
  ACTIVITY_TECHNICAL_REPORT_LOADING_LABEL,
  ACTIVITY_TECHNICAL_REPORT_PICKER_CLASS,
  ACTIVITY_TECHNICAL_REPORT_ROW_CLASS,
} from './activity-technical-view.constants';
import type { ActivityTechnicalStoredReportProps } from './activity-technical-view.types';

/**
 * The Data tab of a line with a reading: the report picker of a group of two
 * or more, then the shown report as stored, its `failed` included. Loading,
 * not found, failure and the report are exclusive.
 */
export function ActivityTechnicalStoredReport({ reports, selectedReportId, reportStatus, reportJson, onPickReport, onRetryReport }: ActivityTechnicalStoredReportProps) {
  const { scrollRef, onScroll, visibleItems } = useDrawerReportWindow(reports);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {reports.length > 1 && (
        <div className={ACTIVITY_TECHNICAL_REPORT_PICKER_CLASS} onScroll={onScroll} ref={scrollRef}>
          <ListBox
            aria-label={DRAWER_REPORTS_TITLE}
            className="gap-0.5 p-0"
            disallowEmptySelection
            onSelectionChange={(keys) => onPickReport(Number([...keys][0]))}
            selectedKeys={selectedReportId === undefined ? [] : [String(selectedReportId)]}
            selectionMode="single"
          >
            {visibleItems.map((report) => (
              <ListBox.Item className={ACTIVITY_TECHNICAL_REPORT_ROW_CLASS} id={String(report.id)} key={report.id} textValue={report.label}>
                {report.label}
              </ListBox.Item>
            ))}
          </ListBox>
        </div>
      )}
      {reportStatus === 'loading' && (
        <div aria-labelledby="activity-technical-report-loading-label" aria-live="polite" role="status">
          <span className="sr-only" id="activity-technical-report-loading-label">
            {ACTIVITY_TECHNICAL_REPORT_LOADING_LABEL}
          </span>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      )}
      {reportStatus === 'failed' && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{ACTIVITY_TECHNICAL_REPORT_ERROR_TITLE}</Alert.Title>
            <Button className="mt-2 self-start" onPress={onRetryReport} size="sm" variant="secondary">
              Try again
            </Button>
          </Alert.Content>
        </Alert>
      )}
      {reportStatus === 'gone' && <ActivityTechnicalEmpty description={ACTIVITY_TECHNICAL_REPORT_GONE.description} title={ACTIVITY_TECHNICAL_REPORT_GONE.title} />}
      {reportStatus === 'ready' && reportJson !== undefined && (
        <section aria-label={DRAWER_STORED_REPORT_LABEL} className="flex min-w-0 flex-col gap-2">
          <h3 className="text-[13px] font-medium text-muted">{DRAWER_STORED_REPORT_LABEL}</h3>
          <ActivityTechnicalJson raw={reportJson} />
        </section>
      )}
    </div>
  );
}
