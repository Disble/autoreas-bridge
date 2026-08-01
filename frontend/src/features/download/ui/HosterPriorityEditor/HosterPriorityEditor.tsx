import { DragDropProvider } from '@dnd-kit/react';
import { EmptyState, Skeleton } from '@heroui/react';
import { SortableHosterRow } from './SortableHosterRow';
import { useHosterPriorityEditor } from './use-hoster-priority-editor';
import type { HosterPriorityEditorProps } from './hoster-priority-editor.types';

/**
 * HosterPriorityEditor renders the user-orderable hoster priority list.
 * Reordering runs on @dnd-kit/react, which drives drags with POINTER events —
 * the only thing that works reliably inside Wails WebView2 (AGENTS.md rule 11).
 * It also ships keyboard reordering and screen-reader announcements. All Wails
 * calls and reorder/persist logic live in the colocated `useHosterPriorityEditor`
 * hook; this component is presentation-only.
 */
export function HosterPriorityEditor({ className }: Readonly<HosterPriorityEditorProps>) {
  const { status, items, isSaving, errorMessage, onDragEnd } = useHosterPriorityEditor();

  if (status === 'loading') {
    return (
      <section aria-label="Loading hoster priority" className={className}>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
        <Skeleton className="mt-2 h-10 w-full rounded-lg" />
      </section>
    );
  }

  if (status === 'empty') {
    return (
      <EmptyState className={className}>
        <EmptyState.Root>No hosters configured. Add hosters from your download provider settings.</EmptyState.Root>
      </EmptyState>
    );
  }

  return (
    <section aria-labelledby="hoster-priority-editor-heading" className={className}>
      <h2 className="sr-only" id="hoster-priority-editor-heading">
        Hoster priority
      </h2>
      {errorMessage !== undefined && (
        <p className="mb-3 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {errorMessage}
        </p>
      )}

      <div aria-atomic="true" aria-live="polite" className="sr-only">
        {isSaving ? 'Saving hoster priority order…' : 'Hoster priority order saved.'}
      </div>

      <DragDropProvider onDragEnd={(event) => void onDragEnd(event)}>
        <ul aria-label="Hoster priority" className="flex flex-col gap-2">
          {items.map((row, index) => (
            <SortableHosterRow key={row.id} index={index} row={row} />
          ))}
        </ul>
      </DragDropProvider>
    </section>
  );
}
