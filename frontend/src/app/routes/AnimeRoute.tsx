import { AnimePanel } from '../../features/anime/ui/AnimePanel/AnimePanel';

export function AnimeRoute() {
  return (
    <div className="flex flex-col gap-4">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">Animes</h1>
        <p className="text-sm text-muted">Browse the local anime catalog</p>
      </header>
      <div className="min-w-0">
        <AnimePanel />
      </div>
    </div>
  );
}
