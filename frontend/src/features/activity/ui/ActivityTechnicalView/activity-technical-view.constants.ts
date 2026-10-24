import type { DrawerTechnicalTab } from '../../drawer/drawer.types';

/** Words of each technical tab. */
export const ACTIVITY_TECHNICAL_TAB_LABELS: Readonly<Record<DrawerTechnicalTab, string>> = {
  requests: 'Requests',
  events: 'Events',
  data: 'Data',
};

/** Chip color per event level; an unknown level stays neutral. */
export const ACTIVITY_TECHNICAL_LEVEL_COLORS: Readonly<Record<string, 'danger' | 'warning' | 'default'>> = {
  error: 'danger',
  warn: 'warning',
};

/** The chip of a body cut at the capture limit (`requestcapture.MaxCapturedBodyBytes`). */
export const ACTIVITY_TECHNICAL_CUT_LABEL = 'Cut at 64 KB';

/** Loading label of the picked request. */
export const ACTIVITY_TECHNICAL_REQUEST_LOADING_LABEL = 'Loading the request';

/** The chip of a stack cut at the report limit (`frontendErrorStackLimit`). */
export const ACTIVITY_TECHNICAL_STACK_CUT_LABEL = 'Cut at 8 KB';

/** Loading label of a picked occurrence. */
export const ACTIVITY_TECHNICAL_OCCURRENCE_LOADING_LABEL = 'Loading the occurrence';

/** Failure title of a picked occurrence. */
export const ACTIVITY_TECHNICAL_OCCURRENCE_ERROR_TITLE = 'This occurrence could not be read';

/** The segmented control frame of the mockup (`.ax-seg`): default fill, 12px radius, 3px inset. */
export const ACTIVITY_TECHNICAL_SEGMENT_CLASS = 'w-fit max-w-full gap-0.5 overflow-x-auto rounded-xl bg-default p-[3px]';

/** One segment of the mockup: 30px tall, 10px inset, 9.6px radius, 13px muted text. */
export const ACTIVITY_TECHNICAL_SEGMENT_BUTTON_CLASS =
  'h-[30px] min-w-[30px] rounded-[9.6px] px-2.5 text-[13px] font-normal text-muted data-[selected=true]:bg-[oklch(39.64%_.01_285.93)] data-[selected=true]:text-foreground';

/** The selected tab indicator of the mockup. */
export const ACTIVITY_TECHNICAL_TAB_INDICATOR_CLASS = 'rounded-[9.6px] bg-[oklch(39.64%_.01_285.93)] shadow-none';

/** A stored code box of the mockup (`.ax-code`): the page background, 12px radius, 12px by 14px inset. */
export const ACTIVITY_TECHNICAL_CODE_CLASS = 'max-h-[300px] overflow-auto rounded-xl bg-background px-3.5 py-3 font-mono text-xs leading-[1.55] text-foreground';

/** The colour of each JSON run, as the mockup's `.ax-code .k` and `.ax-code .s`. */
export const ACTIVITY_TECHNICAL_JSON_TOKEN_CLASS: Readonly<Record<'key' | 'string' | 'plain', string>> = {
  key: 'text-[color-mix(in_oklab,var(--accent)_60%,var(--foreground))]',
  string: 'text-[color-mix(in_oklab,var(--success)_70%,var(--foreground))]',
  plain: '',
};

/** A status chip of the mockup (`.ax-code-chip`): success tone. */
export const ACTIVITY_TECHNICAL_STATUS_CHIP_CLASS =
  'rounded-full bg-[color-mix(in_oklab,var(--success)_18%,transparent)] px-[7px] py-px text-[11px] text-success tabular-nums';

/** A refused status chip of the mockup (`.ax-code-chip.bad`). */
export const ACTIVITY_TECHNICAL_FAILED_CHIP_CLASS =
  'rounded-full bg-[color-mix(in_oklab,var(--danger)_22%,transparent)] px-[7px] py-px text-[11px] text-[color-mix(in_oklab,var(--danger)_70%,var(--foreground))] tabular-nums';

/** The warning chip of a cut body (`.ax-trunc`). */
export const ACTIVITY_TECHNICAL_TRUNC_CHIP_CLASS =
  'rounded-full bg-[color-mix(in_oklab,var(--warning)_18%,transparent)] px-[7px] py-px text-[11px] font-normal text-warning';

/** One route-and-status row of the mockup (`.ax-req`): 36px, 10px inset, the default fill when picked. */
export const ACTIVITY_TECHNICAL_REQUEST_ROW_CLASS =
  'grid h-9 grid-cols-[minmax(0,1fr)_auto_32px_44px] items-center gap-2.5 rounded-[.6rem] px-2.5 text-[13px] text-foreground data-[selected=true]:bg-default';

/** A JSON string literal, escapes included; the tokenizer walks a body by it. */
export const ACTIVITY_JSON_STRING_PATTERN = /"(?:[^"\\]|\\.)*"/g;
