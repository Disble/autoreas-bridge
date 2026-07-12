import { Chip, EmptyState, Skeleton } from '@heroui/react';
import { Button, GridList, GridListItem, useDragAndDrop } from 'react-aria-components';
import { useHosterPriorityEditor } from './use-hoster-priority-editor';
import type { HosterPriorityEditorProps, HosterPriorityRowViewModel } from './hoster-priority-editor.types';

/**
 * HosterPriorityEditor renders the user-orderable hoster priority list.
 * Reordering is driven by `react-aria-components`' `GridList` +
 * `useDragAndDrop` — the accessible drag-and-drop primitive available in the
 * installed stack — which provides pointer drag, native keyboard reorder
 * (Space to grab, Arrow keys to move, Space/Enter to drop, Escape to cancel),
 * and built-in screen-reader announcements out of the box. All Wails calls
 * and reorder/persist logic live in the colocated `useHosterPriorityEditor`
 * hook; this component is presentation-only.
 */
export function HosterPriorityEditor({ className }: Readonly<HosterPriorityEditorProps>) {
  const { status, items, isSaving, errorMessage, reorder } = useHosterPriorityEditor();

  const { dragAndDropHooks } = useDragAndDrop({
    getItems: (keys) =>
      [...keys].map((key) => ({ 'text/plain': String(key) })),
    onReorder: (event) => {
      const draggedKey = String([...event.keys][0]);
      const targetKey = String(event.target.key);

      reorder(String(draggedKey), String(targetKey), event.target.dropPosition === 'after' ? 'after' : 'before').catch(
        () => undefined,
      );
    },
  });

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

      <GridList
        aria-label="Hoster priority"
        className="flex flex-col gap-2"
        dragAndDropHooks={dragAndDropHooks}
        items={items}
      >
        {(item: HosterPriorityRowViewModel) => (
          <GridListItem
            className="flex items-center justify-between gap-3 rounded-lg border border-divider/60 bg-content1/60 px-3 py-2.5 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 data-[dragging]:opacity-60 data-[focus-visible]:ring-2"
            id={item.id}
            textValue={item.hoster}
          >
            <Button
              aria-label={`Reorder ${item.hoster}`}
              className="cursor-grab touch-none rounded-md p-1 text-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-primary/60"
              slot="drag"
            >
              <span aria-hidden="true">⠿</span>
            </Button>
            <span className="flex-1 font-medium text-foreground">{item.hoster}</span>
            <Chip color={item.enabled ? 'success' : 'default'} size="sm" variant="soft">
              {item.enabled ? 'Enabled' : 'Disabled'}
            </Chip>
          </GridListItem>
        )}
      </GridList>
    </section>
  );
}
