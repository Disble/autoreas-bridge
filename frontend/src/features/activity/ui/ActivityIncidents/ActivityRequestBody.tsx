import { Button, Typography } from '@heroui/react';
import { CodeBlock } from '../../../../shared/ui/CodeBlock/CodeBlock';
import type { ActivityRequestBodyProps } from './activity-incidents.types';

/**
 * One stored body: its first lines as plain text (nothing is parsed until
 * asked), then "Show full body" opens the whole text in the shared viewer.
 */
export function ActivityRequestBody({ body, isOpen, onToggle }: ActivityRequestBodyProps) {
  if (body.state === 'not-captured') {
    return <CodeBlock label={body.label} notice={body.notice} raw="" state="not-captured" />;
  }

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {isOpen ? (
        <CodeBlock label={body.label} raw={body.raw} state="captured" />
      ) : (
        <>
          <span className="text-xs font-medium text-muted">{body.label}</span>
          <pre className="max-h-48 min-w-0 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-secondary p-2 font-mono text-xs text-foreground" data-body-preview>
            {body.preview}
            {body.isComplete ? null : <span aria-hidden>…</span>}
          </pre>
        </>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {body.isComplete ? null : (
          <Button aria-expanded={isOpen} onPress={onToggle} size="sm" variant="tertiary">
            {isOpen ? 'Show first lines' : 'Show full body'}
          </Button>
        )}
        {body.note === '' ? null : (
          <Typography color="muted" type="body-xs">
            {body.note}
          </Typography>
        )}
      </div>
    </div>
  );
}
