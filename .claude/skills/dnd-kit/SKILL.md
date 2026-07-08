---
name: dnd-kit
description: "Drag-and-drop for the bridge frontend using the NEW @dnd-kit/react + @dnd-kit/helpers (React 19 + StrictMode safe, pointer-based — works in Wails WebView2). Use when adding/editing draggable, sortable, or kanban/multi-column boards; migrating off legacy @dnd-kit/core; or debugging 'nothing drags'. Keywords: dnd-kit, @dnd-kit/react, @dnd-kit/helpers, useSortable, useDroppable, DragDropProvider, move, drag and drop, sortable, kanban, OrderingBoard."
metadata:
  author: autoreas-bridge
  version: "1.0.0"
---

# dnd-kit (new @dnd-kit/react) — bridge frontend

The bridge frontend is **React 19 + StrictMode** inside a **Wails WebView2** webview. That combination dictates the drag-and-drop stack — get this wrong and cards silently refuse to move.

## Non-negotiables (learned the hard way)

- **Use the NEW packages: `@dnd-kit/react` + `@dnd-kit/helpers`.** They are built for React 19 and are StrictMode-safe.
- **Do NOT use legacy `@dnd-kit/core` / `@dnd-kit/sortable` / `@dnd-kit/utilities`.** On React 19 + StrictMode their node registration breaks and **nothing is draggable**. If you find them in `package.json`, migrate (see below) and `bun remove` them.
- **Do NOT use native HTML5 drag-and-drop** (`draggable` + `onDragStart`/`onDrop`). It is unreliable in Wails WebView2 — the gesture often never fires. @dnd-kit uses **pointer events**, which work in WebView2.
- **Never remove `React.StrictMode` to "fix" dragging.** That was a real mistake in this repo. The new `@dnd-kit/react` works with StrictMode; keep it.
- Install with bun: `bun add @dnd-kit/react @dnd-kit/helpers` (never hand-edit `package.json`).

## The new API (vs legacy — the migration cheat-sheet)

| Legacy `@dnd-kit/core` | New `@dnd-kit/react` |
| --- | --- |
| `DndContext` | `DragDropProvider` (from `@dnd-kit/react`) |
| `onDragEnd={({active, over})=>}` | `onDragOver`/`onDragEnd={(event)=>}`; use `event.operation.source` / `event.operation.target` |
| `useSortable` from `@dnd-kit/sortable` → `{setNodeRef, listeners, attributes, transform, transition}` | `useSortable` from `@dnd-kit/react/sortable` → `{ref, isDragging}` (no listeners/attributes/transform to spread) |
| `useDroppable` → `{setNodeRef, isOver}` | `useDroppable` (from `@dnd-kit/react`) → `{ref, isDropTarget}` |
| `<SortableContext strategy={...}>` wrapper | **removed** — no wrapper, no strategy props |
| Manual `arrayMove` + index math | `move(items, event)` from `@dnd-kit/helpers` |
| `<DragOverlay>{activeId ? <Item/> : null}</DragOverlay>` + `useState` | `<DragOverlay>{(source) => <Item id={source.id}/>}</DragOverlay>` (render-prop, no state) |

Official migration guide: `https://dndkit.com/react/guides/migration.md`. **Fetch current docs before implementing — do not rely on memory.**

## Multi-column / kanban pattern (what OrderingBoard uses)

State is a **map of container id → ordered item ids**; `move` reshuffles it live on `onDragOver`.

```tsx
import {DragDropProvider, DragOverlay, useDroppable} from '@dnd-kit/react';
import {useSortable} from '@dnd-kit/react/sortable';
import {move} from '@dnd-kit/helpers';

// state: Record<columnId, itemId[]>  e.g. {A:['a0','a1'], B:[], ...}
<DragDropProvider onDragOver={(event) => setItems((items) => move(items, event))}>
  {/* one column per key; empty columns still need a droppable */}
</DragDropProvider>

// Item — dragging sets BOTH group (column) and order (index):
function Item({id, index, column}) {
  const {ref, isDragging} = useSortable({id, index, group: column, type: 'item', accept: 'item'});
  return <li ref={ref} style={{touchAction: 'none', opacity: isDragging ? 0.4 : 1}}>…</li>;
}

// Column — droppable so items can land on an EMPTY column:
function Column({id, children}) {
  const {ref} = useDroppable({id, type: 'column', accept: 'item'});
  return <div ref={ref}>{children}</div>;
}
```

Key facts:
- `useSortable` needs a **globally-unique, stable `id`** per instance. Clones of the same entity (e.g. an anime on several days) must each get a distinct stable key — the id cannot encode the current container because the container changes on move; track the container as the **map key** instead.
- `move(items, event)` accepts a `Record<container, id[]>` and handles cross-column moves, empty columns, and index math. Enforce app rules (e.g. "no duplicate in one column", "keep at least one") by validating/rejecting the returned map.
- Put `style={{touchAction: 'none'}}` on draggable items so the PointerSensor wins the gesture.
- Buttons inside a draggable card: add `onPointerDown={(e)=>e.stopPropagation()}` so clicking them does not start a drag.

## Bridge architecture fit (strict frontend rules apply)

- Keep the **drag→state mapping (business logic) in the `use-*.ts` hook** (e.g. the `onDragOver` handler); the `.tsx` stays dumb.
- `useSortable`/`useDroppable`/`DragDropProvider` are 3rd-party hooks — allowed in feature `.tsx`, but each sortable item and droppable column should be its **own small component file** (colocation forbids root-level non-component helpers in a component file).
- Props interfaces live in `*.types.ts` and destructure as `Readonly<Props>`. Reference implementation: `frontend/src/features/season/ui/OrderingBoard/`.
- DnD gestures are **not exercisable under jsdom** — unit-test the pure reducer/helpers (build/serialize draft, dedup rules, move-acceptance), not the drag itself.
