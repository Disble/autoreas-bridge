import { Input, Label, ListBox, Select } from '@heroui/react';
import type { AnimeFilterBarProps } from './anime-filter-bar.types';

/**
 * Renders the search box and advanced filter controls for the anime catalog.
 * All state and callbacks are controlled by the parent hook.
 */
export function AnimeFilterBar(props: Readonly<AnimeFilterBarProps>) {
  const {
    filters,
    estadoOptions,
    activoOptions,
    tipoOptions,
    diaOptions,
    generoOptions,
    gapOptions,
    onQueryChange,
    onEstadoChange,
    onActivoChange,
    onTipoChange,
    onDiaChange,
    onGenerosChange,
    onGapChange,
  } = props;

  return (
    <section aria-label="Anime filters" className="flex flex-col gap-3">
      <Input
        aria-label="Search animes"
        className="w-full"
        placeholder="Search by name..."
        type="search"
        value={filters.query}
        onChange={(event) => onQueryChange(event.target.value)}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select
          aria-label="Filter by status"
          placeholder="Status"
          value={filters.estado}
          onChange={(value) => onEstadoChange(value?.toString() ?? 'all')}
        >
          <Label>Status</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {estadoOptions.map((option) => (
                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by active state"
          placeholder="Active"
          value={filters.activo}
          onChange={(value) => onActivoChange(value?.toString() ?? 'all')}
        >
          <Label>Active</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {activoOptions.map((option) => (
                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by type"
          placeholder="Type"
          value={filters.tipo}
          onChange={(value) => onTipoChange(value?.toString() ?? 'all')}
        >
          <Label>Type</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {tipoOptions.map((option) => (
                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by day"
          placeholder="Day"
          value={filters.dia}
          onChange={(value) => onDiaChange(value?.toString() ?? 'all')}
        >
          <Label>Day</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {diaOptions.map((option) => (
                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>

        <Select
          aria-label="Filter by download gap"
          placeholder="Download gap"
          value={filters.gap}
          onChange={(value) => onGapChange(value?.toString() ?? 'all')}
        >
          <Label>Download gap</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {gapOptions.map((option) => (
                <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                  {option.label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>

      <Select
        aria-label="Filter by genres"
        className="w-full"
        placeholder="Genres"
        selectionMode="multiple"
        value={filters.generos}
        onChange={(value) =>
          onGenerosChange(
            (Array.isArray(value) ? value : [value ?? '']).map((item) =>
              typeof item === 'number' ? String(item) : item,
            ),
          )
        }
      >
        <Label>Genres</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox selectionMode="multiple">
            {generoOptions.map((option) => (
              <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
                {option.label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </section>
  );
}
