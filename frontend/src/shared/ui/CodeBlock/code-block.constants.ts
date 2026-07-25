import type { CodeBlockView } from './code-block.types';

/** How long the "Copied" confirmation stays visible before self-clearing. */
export const COPY_CONFIRMATION_MS = 1500;

/** Copy button label while idle. */
export const COPY_IDLE_LABEL = 'Copy';

/** Copy button label while the confirmation window is active. */
export const COPY_DONE_LABEL = 'Copied';

/** Pretty/Raw view switch options for the CodeBlock's `ToggleButtonGroup`. */
export const CODE_BLOCK_VIEW_OPTIONS: ReadonlyArray<{ readonly id: CodeBlockView; readonly label: string }> = [
  { id: 'pretty', label: 'Pretty' },
  { id: 'raw', label: 'Raw' },
];

/** Notice shown when the captured content itself is the empty string. */
export const CODE_BLOCK_EMPTY_CAPTURED_NOTICE = 'The captured content is empty.';
