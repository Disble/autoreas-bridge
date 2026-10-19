import { Skeleton } from '@heroui/react';

/** Renders the anime data card's fields as skeleton shapes while the selected record loads. */
export function AnimeEditorFormSkeleton() {
  return (
    <div className="flex flex-col gap-5" data-testid="anime-editor-form-skeleton">
      <div className="flex flex-col gap-2"><Skeleton className="h-3 w-16 rounded" /><Skeleton className="h-10 w-full rounded-lg" /></div>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((slot) => <div className="flex flex-col gap-2" key={slot}><Skeleton className="h-3 w-24 rounded" /><Skeleton className="h-10 w-full rounded-lg" /></div>)}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((slot) => <div className="flex flex-col gap-2" key={slot}><Skeleton className="h-3 w-28 rounded" /><Skeleton className="h-10 w-full rounded-lg" /></div>)}
      </div>
      <Skeleton className="h-9 w-44 rounded-lg" />
    </div>
  );
}
