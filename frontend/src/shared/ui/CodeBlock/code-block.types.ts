/** Which content state a CodeBlock is rendering. */
export type CodeBlockState = 'captured' | 'not-captured' | 'redacted';

/** Which of the two views is showing; 'raw' is the only view for non-JSON text. */
export type CodeBlockView = 'pretty' | 'raw';

/** Props for the dumb CodeBlock presentational component. */
export interface CodeBlockProps {
  /** Pane title, e.g. "Body". */
  readonly label: string;
  /** Verbatim source text; '' when state !== 'captured'. */
  readonly raw: string;
  readonly state: CodeBlockState;
  /** Caller-owned copy for the not-captured / redacted states. */
  readonly notice?: string;
  readonly ariaLabel?: string;
}
