import { SearchField, ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { SOLO_ANIME_DOWNLOAD_FILTER_OPTIONS } from './solo-anime-download-panel.constants';
import type { SoloAnimeDownloadFilterBarProps } from './solo-anime-download-panel.types';

/** Renders the search field and the Ready/Blocked readiness tabs as one filter concern. */
export function SoloAnimeDownloadFilterBar({
  query,
  filter,
  counts,
  onQueryChange,
  onFilterChange,
}: Readonly<SoloAnimeDownloadFilterBarProps>) {
  return (
    <>
      <SearchField aria-label="Search animes for solo download" fullWidth onChange={onQueryChange} value={query} variant="secondary">
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder="Search an anime..." />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      <ToggleButtonGroup
        aria-label="Download readiness filter"
        disallowEmptySelection
        fullWidth
        selectedKeys={[filter]}
        selectionMode="single"
        size="sm"
        onSelectionChange={(keys) => onFilterChange(String(Array.from(keys)[0] ?? filter))}
      >
        {SOLO_ANIME_DOWNLOAD_FILTER_OPTIONS.map((option) => (
          <ToggleButton id={option.id} key={option.id}>
            {option.label} · {option.id === 'ready' ? counts.ready : counts.blocked}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </>
  );
}
