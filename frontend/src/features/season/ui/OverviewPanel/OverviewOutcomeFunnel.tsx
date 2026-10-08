import { Card, Typography } from '@heroui/react';
import type { OverviewOutcomeFunnelProps } from './overview-panel.types';

/**
 * OverviewOutcomeFunnel is the head of a closed season's Overview: what came
 * out of it, as one funnel from intake to approved against the slots, with the
 * season's facts on a muted line below. The arrows between steps are CSS
 * pseudo-content, so they are decoration only and never read as list text.
 */
export function OverviewOutcomeFunnel({ steps, meta }: Readonly<OverviewOutcomeFunnelProps>) {
  return (
    <Card aria-label="Season outcome" role="region">
      <Card.Content className="flex flex-col gap-4">
        <ol className="flex flex-wrap items-end gap-5">
          {steps.map((step) => (
            <li
              key={step.label}
              className="flex items-end gap-5 not-first:before:self-center not-first:before:text-xl not-first:before:text-muted not-first:before:content-['→']"
            >
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-xs text-muted">{step.label}</span>
                <span className="text-3xl font-semibold text-foreground">
                  {step.value}
                  <span className="ml-1 text-base font-normal text-muted empty:hidden">{step.suffix}</span>
                </span>
              </span>
            </li>
          ))}
        </ol>
        <Typography color="muted" type="body-sm">
          {meta}
        </Typography>
      </Card.Content>
    </Card>
  );
}
