import { Button, Chip, Typography } from '@heroui/react';
import { CodeBlock } from '../../../../shared/ui/CodeBlock/CodeBlock';
import type { ActivityRunMetadataProps } from './activity-run-story.types';

/**
 * The selected step's recorded detail: its metadata as labelled fields, a
 * list of probes or retries drawn in order, and the raw JSON one press away.
 */
export function ActivityRunMetadata({ metadata, isRawOpen, onToggleRaw }: ActivityRunMetadataProps) {
  return (
    <section aria-labelledby="activity-run-metadata" className="flex min-w-0 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Typography id="activity-run-metadata" type="h3">
          Recorded detail
        </Typography>
        {metadata.raw === '' ? null : (
          <Button aria-expanded={isRawOpen} onPress={onToggleRaw} size="sm" variant="tertiary">
            {isRawOpen ? 'Hide raw metadata' : 'Show raw metadata'}
          </Button>
        )}
      </div>
      {metadata.raw === '' ? (
        <Typography color="muted" type="body-sm">
          Nothing was recorded with this step.
        </Typography>
      ) : null}
      {metadata.fields.length === 0 ? null : (
        <dl className="grid min-w-0 grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
          {metadata.fields.map((field) => (
            <div className="contents" key={field.label}>
              <dt className="min-w-0 truncate text-muted">{field.label}</dt>
              <dd className="min-w-0 text-foreground [overflow-wrap:anywhere]">
                {field.kind === 'value' ? (
                  field.value
                ) : (
                  <ol aria-label={field.label} className="flex flex-wrap items-center gap-1">
                    {field.items.map((item, index) => (
                      <li className="flex min-w-0 items-center gap-1" key={`${index}-${item}`}>
                        <span aria-hidden className="text-xs text-muted">
                          {index + 1}
                        </span>
                        <Chip size="sm" variant="soft">
                          {item}
                        </Chip>
                      </li>
                    ))}
                  </ol>
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
      {isRawOpen ? <CodeBlock label="Raw metadata" raw={metadata.raw} state="captured" /> : null}
    </section>
  );
}
