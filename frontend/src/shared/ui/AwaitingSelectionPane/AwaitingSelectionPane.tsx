import { Icon } from '@iconify/react';
import { Typography } from '@heroui/react';
import { AWAITING_SELECTION_EMPTY_VALUE } from './awaiting-selection-pane.constants';
import type { AwaitingSelectionPaneProps } from './awaiting-selection-pane.types';

/**
 * The detail pane of a master/detail surface before a row is selected. It is
 * the filled pane without data: a circle where the cover or mark goes, the
 * prompt where the name goes, and the pane's real field labels dimmed with an
 * em dash, top-anchored and left-aligned so selecting a row fills the same
 * slots without anything moving. No mascot and no skeleton shapes: this is a
 * resting state, not an empty result and not a load
 * (docs/design/patterns/empty-states.md, "awaiting-selection").
 *
 * The preview is hidden from assistive technology; the heading and its line
 * are what a screen reader needs.
 */
export function AwaitingSelectionPane({ description, fields = [], footer, icon, sectionLabel, title }: Readonly<AwaitingSelectionPaneProps>) {
  const hasPreview = fields.length > 0 || sectionLabel !== undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 text-[13px]">
      <div className="flex items-center gap-3">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-default text-muted">
          <Icon aria-hidden="true" className="size-7" icon={icon} />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <Typography className="text-sm" type="h3">{title}</Typography>
          <Typography color="muted" type="body-sm">{description}</Typography>
        </span>
      </div>
      {hasPreview ? (
        <div aria-hidden="true" className="flex flex-col gap-3 opacity-55" data-awaiting-preview="">
          {fields.length === 0 ? null : (
            <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
              {fields.map((field) => (
                <div className="contents" key={field}>
                  <dt className="text-muted">{field}</dt>
                  <dd className="text-right text-foreground">{AWAITING_SELECTION_EMPTY_VALUE}</dd>
                </div>
              ))}
            </dl>
          )}
          {sectionLabel === undefined ? null : <p className="text-[11.5px] font-semibold tracking-wide text-muted uppercase">{sectionLabel}</p>}
        </div>
      ) : null}
      {footer === undefined ? null : (
        <p className="mt-auto border-t border-divider pt-3 text-xs text-muted" data-awaiting-footer="">{footer}</p>
      )}
    </div>
  );
}
