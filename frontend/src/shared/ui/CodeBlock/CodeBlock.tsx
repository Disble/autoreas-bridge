import { Button, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { CODE_BLOCK_EMPTY_CAPTURED_NOTICE, CODE_BLOCK_VIEW_OPTIONS, COPY_DONE_LABEL, COPY_IDLE_LABEL } from './code-block.constants';
import type { CodeBlockProps, CodeBlockView } from './code-block.types';
import { useCodeBlock } from './use-code-block';

/**
 * Dumb read-only text/code viewer: an optional Pretty/Raw switch (only when
 * the raw text is JSON), a copy-raw action with a self-clearing "Copied"
 * confirmation, and explicit not-captured/redacted notices instead of an
 * empty or misleading code area. No `useEffect`, no parsing/formatting logic
 * — all of that lives in `use-code-block.ts` / `code-block.helpers.ts`.
 */
export function CodeBlock({ label, raw, state, notice, ariaLabel }: Readonly<CodeBlockProps>) {
  const { view, isJson, text, isCopied, onViewChange, onCopy } = useCodeBlock(raw);

  if (state !== 'captured') {
    return (
      <div className="flex min-w-0 flex-col gap-1">
        <span className="min-w-0 truncate text-xs font-medium text-default-500">{label}</span>
        <p className="rounded-md bg-content2/40 p-2 text-xs text-default-500">{notice}</p>
      </div>
    );
  }

  return (
    // `min-w-0` here is hardening, NOT the fix for the Activity overflow.
    // Measured in headless Edge (`scripts/layout-smoke.mjs`): the `<pre>` below
    // already contained a 7973px unbroken line inside a 391px pane without it,
    // because a scroll container does not hand its content width to its
    // ancestors. What it buys is that this wrapper cannot start doing so if a
    // future pane beside the `<pre>` is not a scroll container.
    //
    // `min-h-40` is the opposite case: it IS load-bearing, and it belongs HERE
    // rather than on the `<pre>`. A flex item's default `min-height: auto`
    // would refuse to shrink below its content, so the chain down from the card
    // releases it at every level -- but a `flex-1` item whose basis is 0 then
    // takes only what its siblings LEAVE, and a headers block full of
    // `break-all` URLs leaves nothing (measured: 22px of a 512px card). A floor
    // on this wrapper is what makes the shortfall fall on the siblings that can
    // scroll instead. On the `<pre>` it did nothing: this wrapper shrinks
    // freely, so the floor overflowed it rather than pushing back.
    <div className="flex min-h-40 min-w-0 flex-1 flex-col gap-1">
      <div className="flex min-w-0 shrink-0 items-center justify-between gap-2">
        <span className="min-w-0 truncate text-xs font-medium text-default-500">{label}</span>
        <div className="flex shrink-0 items-center gap-2">
          {isJson ? (
            <ToggleButtonGroup
              aria-label={`${ariaLabel ?? label} view`}
              disallowEmptySelection
              onSelectionChange={(keys) => {
                const [first] = keys;
                onViewChange(String(first) as CodeBlockView);
              }}
              selectedKeys={[view]}
              selectionMode="single"
              size="sm"
            >
              {CODE_BLOCK_VIEW_OPTIONS.map((option) => (
                <ToggleButton id={option.id} key={option.id}>
                  {option.label}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
          ) : null}
          <Button onPress={onCopy} size="sm" variant="tertiary">
            {isCopied ? COPY_DONE_LABEL : COPY_IDLE_LABEL}
          </Button>
        </div>
      </div>
      {/* `flex-1` rather than a fixed cap: the pane takes whatever the card has
          left after the label row, so a tall card is filled instead of leaving
          a dead band under it. What bounds it is the card's own height budget
          further up -- this element must never grow the card. */}
      <pre className="min-h-0 flex-1 overflow-auto rounded-md bg-content2/40 p-2 font-mono text-xs text-foreground">
        {raw === '' ? CODE_BLOCK_EMPTY_CAPTURED_NOTICE : text}
      </pre>
    </div>
  );
}
