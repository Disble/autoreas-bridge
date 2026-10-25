import { Card } from '@heroui/react';
import type { RunHistoryCardProps } from './run-history-panel.types';

/**
 * RunHistoryCard is the titled card that frames the run history. The card-level controls (Stop run,
 * Problems filter) sit in its header, beside the title, rather than inside the list they act on.
 */
export function RunHistoryCard({ className, tools, children }: Readonly<RunHistoryCardProps>) {
  return (
    <Card className={className}>
      <Card.Header>
        <div className="flex items-start justify-between gap-4" data-testid="run-history-header">
          <div className="flex min-w-0 flex-col gap-1">
            <Card.Title>Run history</Card.Title>
            <Card.Description>Past download checks and any manual links left by an offline JDownloader</Card.Description>
          </div>
          {tools}
        </div>
      </Card.Header>
      <Card.Content>{children}</Card.Content>
    </Card>
  );
}
