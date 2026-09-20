import { Alert } from '@heroui/react';
import { TRANSACTION_DIAGNOSTICS_REPORT_HEADING } from './transaction-diagnostics.constants';
import type { TransactionDiagnosticsReportViewModel } from './transaction-diagnostics.types';
import { TransactionDetailFieldList } from './TransactionDetailFieldList';

/**
 * Dumb rendering of one diagnostics capture's projected report in the Request
 * tab, beside the raw captured body (which the Payload CodeBlock below it
 * still shows in full). A report renders as the projected label/value list; a
 * capture that cannot yield a report renders the no-report notice instead, so
 * a skipped or empty body never reads as zeroes.
 */
export function TransactionDetailDiagnostics({ report }: Readonly<{ report: TransactionDiagnosticsReportViewModel }>) {
  if (report.kind === 'no-report') {
    return (
      <Alert className="shrink-0" status="default">
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>{report.notice}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <section className="flex min-w-0 shrink-0 flex-col gap-1">
      <span className="text-xs font-medium text-default-500">{TRANSACTION_DIAGNOSTICS_REPORT_HEADING}</span>
      <TransactionDetailFieldList rows={report.rows} />
    </section>
  );
}
