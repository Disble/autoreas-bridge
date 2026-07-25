import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COPY_CONFIRMATION_MS } from './code-block.constants';
import { isJsonCodeText, resolveCodeText } from './code-block.helpers';
import type { CodeBlockView } from './code-block.types';

/**
 * Owns a CodeBlock's view state (Pretty/Raw), the copy-to-clipboard action,
 * and its transient "Copied" confirmation timer. `onCopy` always writes the
 * caller-supplied `raw` string to the clipboard — never the derived pretty
 * text — regardless of which view is active.
 */
export function useCodeBlock(raw: string) {
  // 1. Refs
  const timerRef = useRef<number | null>(null);

  // 2. State
  const [view, setView] = useState<CodeBlockView>('pretty');
  const [isCopied, setIsCopied] = useState(false);

  // 3. Context/3rd Party Hooks

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const isJson = useMemo(() => isJsonCodeText(raw), [raw]);
  const text = useMemo(() => resolveCodeText(raw, view), [raw, view]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onViewChange = useCallback((nextView: CodeBlockView) => {
    setView(nextView);
  }, []);

  const onCopy = useCallback(() => {
    navigator.clipboard
      .writeText(raw)
      .then(() => {
        if (timerRef.current !== null) {
          window.clearTimeout(timerRef.current);
        }

        setIsCopied(true);
        timerRef.current = window.setTimeout(() => {
          setIsCopied(false);
          timerRef.current = null;
        }, COPY_CONFIRMATION_MS);
      })
      .catch(() => undefined);
  }, [raw]);

  // 7. Effects
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  // 8. Return
  return {
    view,
    isJson,
    text,
    isCopied,
    onViewChange,
    onCopy,
  };
}
