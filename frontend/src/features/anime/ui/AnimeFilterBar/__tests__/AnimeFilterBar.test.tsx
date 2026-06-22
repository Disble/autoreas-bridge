import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnimeFilterBar } from '../AnimeFilterBar';
import {
  ANIME_ACTIVO_OPTIONS,
  ANIME_ESTADO_OPTIONS,
  ANIME_FILTER_ALL_VALUE,
} from '../../AnimePanel/anime-panel.constants';

function createProps(overrides = {}) {
  return {
    filters: {
      query: '',
      estado: ANIME_FILTER_ALL_VALUE,
      activo: ANIME_FILTER_ALL_VALUE,
      tipo: ANIME_FILTER_ALL_VALUE,
      dia: ANIME_FILTER_ALL_VALUE,
      generos: [],
      gap: ANIME_FILTER_ALL_VALUE,
    },
    estadoOptions: ANIME_ESTADO_OPTIONS,
    activoOptions: ANIME_ACTIVO_OPTIONS,
    tipoOptions: [],
    diaOptions: [],
    generoOptions: [],
    gapOptions: [],
    onQueryChange: vi.fn(),
    onEstadoChange: vi.fn(),
    onActivoChange: vi.fn(),
    onTipoChange: vi.fn(),
    onDiaChange: vi.fn(),
    onGenerosChange: vi.fn(),
    onGapChange: vi.fn(),
    ...overrides,
  };
}

function getSearchInput(container: HTMLElement): HTMLInputElement {
  const inputs = Array.from(container.querySelectorAll('input[type="search"]'));

  expect(inputs.length).toBeGreaterThan(0);
  return inputs[0] as HTMLInputElement;
}

describe('AnimeFilterBar', () => {
  it('renders the search input', () => {
    const { container } = render(<AnimeFilterBar {...createProps()} />);

    expect(getSearchInput(container)).toBeInTheDocument();
  });

  it('calls onQueryChange when the user types', () => {
    const props = createProps();
    const { container } = render(<AnimeFilterBar {...props} />);

    fireEvent.change(getSearchInput(container), {
      target: { value: 'Frieren' },
    });

    expect(props.onQueryChange).toHaveBeenLastCalledWith('Frieren');
  });

  it('displays the current query', () => {
    const { container } = render(
      <AnimeFilterBar {...createProps({ filters: { query: 'Frieren' } })} />,
    );

    expect(getSearchInput(container).value).toBe('Frieren');
  });

  it('renders the filter section', () => {
    const { container } = render(<AnimeFilterBar {...createProps()} />);

    expect(container.querySelector('section[aria-label="Anime filters"]')).toBeInTheDocument();
  });

  it('renders the download gap filter control', () => {
    const { container } = render(<AnimeFilterBar {...createProps()} />);

    expect(container.querySelector('[aria-label="Filter by download gap"]')).toBeInTheDocument();
  });
});
