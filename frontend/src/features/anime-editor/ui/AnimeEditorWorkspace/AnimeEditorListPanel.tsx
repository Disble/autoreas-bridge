import { Button, Card, Chip, cn, SearchField, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react';
import { ANIME_EDITOR_FILTER_OPTIONS } from './anime-editor-workspace.constants';
import type { AnimeEditorListPanelProps } from './anime-editor-workspace.types';

/** Renders the progressively loaded watching-first search and selection rail (800+ items). */
export function AnimeEditorListPanel({ viewModel }: Readonly<AnimeEditorListPanelProps>) {
  const { scrollRef, onScroll, visibleCount } = viewModel.listWindow;
  const visibleItems = viewModel.items.slice(0, visibleCount);
  return (
    <Card className="flex h-[80vh] min-w-0 flex-col xl:sticky xl:top-6 xl:h-[calc(100dvh-7rem)]"><Card.Content className="flex h-full min-h-0 min-w-0 flex-col gap-3 p-4">
      <div className="flex items-center justify-between gap-2">
        <Typography type="h4">Library</Typography>
        <Chip color="default" size="sm" variant="soft"><Chip.Label>{viewModel.items.length} animes</Chip.Label></Chip>
      </div>
      <SearchField aria-label="Search anime editor list" fullWidth onChange={viewModel.onQueryChange} value={viewModel.query} variant="secondary">
        <SearchField.Group><SearchField.SearchIcon /><SearchField.Input placeholder="Search an anime..." /><SearchField.ClearButton /></SearchField.Group>
      </SearchField>
      <ToggleButtonGroup aria-label="Anime editor filters" disallowEmptySelection fullWidth selectedKeys={[viewModel.filter]} selectionMode="single" size="sm" onSelectionChange={(keys) => viewModel.onFilterChange(String(Array.from(keys)[0] ?? viewModel.filter))}>
        {ANIME_EDITOR_FILTER_OPTIONS.map((option) => <ToggleButton id={option.id} key={option.id}>{option.label}</ToggleButton>)}
      </ToggleButtonGroup>
      {viewModel.isLoadingList && <Typography color="muted" type="body-sm">Loading anime list...</Typography>}
      {!viewModel.isLoadingList && viewModel.items.length === 0 && <Typography color="muted" type="body-sm">No anime match your search.</Typography>}
      {!viewModel.isLoadingList && viewModel.items.length > 0 && (
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto" data-testid="anime-editor-list-scroll" onScroll={onScroll} ref={scrollRef}>
          <div className="flex flex-col gap-0.5">
            {visibleItems.map((item) => (
              <Button
                className={cn(
                  'min-h-14 h-auto w-full min-w-0 justify-start rounded-xl border-l-2 px-3 py-1.5 transition-colors',
                  item.selected ? 'border-accent bg-accent/10' : 'border-transparent bg-transparent hover:bg-white/[0.04]',
                )}
                key={item.id}
                variant="tertiary"
                onPress={() => viewModel.onSelectAnime(item.animeId)}
              >
                <div className="flex min-w-0 flex-col items-start gap-0.5 text-left">
                  <Typography className="whitespace-normal break-words" type="body-sm" weight="semibold">{item.nombre}</Typography>
                  <Typography color="muted" truncate type="body-xs">{item.subtitle}</Typography>
                </div>
              </Button>
            ))}
          </div>
        </div>
      )}
    </Card.Content></Card>
  );
}
