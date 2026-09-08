import { Card, Chip, SearchField, ToggleButton, ToggleButtonGroup, Typography } from '@heroui/react';
import { useNavigate } from 'react-router';
import editorLibraryAirisArtwork from '../../../../assets/airis-empty-states/editor-library.webp';
import { ANIME_CREATE_ROUTE } from '../../../../shared/navigation/app-layout.constants';
import { AirisEmptyState } from '../../../../shared/ui/AirisEmptyState/AirisEmptyState';
import { AIRIS_CLEAR_CRITERIA_LABEL, AIRIS_CREATE_ANIME_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { AnimeEditorListRow } from './AnimeEditorListRow';
import { AnimeEditorListSkeleton } from './AnimeEditorListSkeleton';
import { ANIME_EDITOR_EMPTY_STATE_COPY, ANIME_EDITOR_FILTER_OPTIONS, ANIME_EDITOR_LIST_LOADING_LABEL } from './anime-editor-workspace.constants';
import type { AnimeEditorListPanelProps } from './anime-editor-workspace.types';

/** Renders the progressively loaded watching-first search and selection rail (800+ items). */
export function AnimeEditorListPanel({ viewModel }: Readonly<AnimeEditorListPanelProps>) {
  const navigate = useNavigate();
  const { scrollRef, onScroll, visibleCount } = viewModel.listWindow;
  const visibleItems = viewModel.items.slice(0, visibleCount);
  const emptyState = viewModel.listEmptyState;
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
      {viewModel.isLoadingList && (
        <div aria-labelledby="anime-editor-list-loading-label" aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-hidden" role="status">
          <span className="sr-only" id="anime-editor-list-loading-label">{ANIME_EDITOR_LIST_LOADING_LABEL}</span>
          <AnimeEditorListSkeleton />
        </div>
      )}
      {emptyState !== 'none' && (
        <AirisEmptyState
          action={emptyState === 'actual'
            ? { label: AIRIS_CREATE_ANIME_LABEL, onPress: () => void navigate(ANIME_CREATE_ROUTE) }
            : { label: AIRIS_CLEAR_CRITERIA_LABEL, onPress: viewModel.onClearCriteria }}
          description={ANIME_EDITOR_EMPTY_STATE_COPY[emptyState].description}
          imageSrc={editorLibraryAirisArtwork}
          title={ANIME_EDITOR_EMPTY_STATE_COPY[emptyState].title}
        />
      )}
      {!viewModel.isLoadingList && viewModel.items.length > 0 && (
        <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto" data-testid="anime-editor-list-scroll" onScroll={onScroll} ref={scrollRef}>
          <div className="flex flex-col gap-0.5">
            {visibleItems.map((item) => (
              <AnimeEditorListRow item={item} key={item.id} onSelectAnime={viewModel.onSelectAnime} />
            ))}
          </div>
        </div>
      )}
    </Card.Content></Card>
  );
}
