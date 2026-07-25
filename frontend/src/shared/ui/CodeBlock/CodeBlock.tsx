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
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium text-default-500">{label}</span>
        <p className="rounded-md bg-content2/40 p-2 text-xs text-default-500">{notice}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-default-500">{label}</span>
        <div className="flex items-center gap-2">
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
      <pre className="max-h-64 overflow-auto rounded-md bg-content2/40 p-2 font-mono text-xs text-foreground">
        {raw === '' ? CODE_BLOCK_EMPTY_CAPTURED_NOTICE : text}
      </pre>
    </div>
  );
}
