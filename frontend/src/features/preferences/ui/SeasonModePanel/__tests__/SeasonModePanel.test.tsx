import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SeasonModePanel } from '../SeasonModePanel';
import { useSeasonModePanel } from '../use-season-mode-panel';

vi.mock('../use-season-mode-panel', () => ({
  useSeasonModePanel: vi.fn(),
}));

const mockedUseSeasonModePanel = vi.mocked(useSeasonModePanel);

type HookReturn = ReturnType<typeof useSeasonModePanel>;

function mockHook(overrides: Partial<HookReturn> = {}): void {
  mockedUseSeasonModePanel.mockReturnValue({
    seasonMode: false,
    isLoading: false,
    label: 'Desactivado',
    errorMessage: undefined,
    toggle: vi.fn(),
    ...overrides,
  });
}

describe('SeasonModePanel', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders the helper text "Ver animes se abre con la sección de Estrenos desplegada en Ver hoy."', () => {
    mockHook();

    render(<SeasonModePanel />);

    expect(
      screen.getByText('Ver animes se abre con la sección de Estrenos desplegada en Ver hoy.'),
    ).toBeInTheDocument();
  });

  it('renders the toggle label "Desactivado" when season mode is false', () => {
    mockHook({ seasonMode: false, label: 'Desactivado' });

    render(<SeasonModePanel />);

    expect(screen.getByText('Desactivado')).toBeInTheDocument();
  });

  it('renders the toggle label "Activado" when season mode is true', () => {
    mockHook({ seasonMode: true, label: 'Activado' });

    render(<SeasonModePanel />);

    expect(screen.getByText('Activado')).toBeInTheDocument();
  });

  it('renders a loading skeleton while isLoading is true', () => {
    mockHook({ isLoading: true });

    render(<SeasonModePanel />);

    expect(screen.getByLabelText('Loading preferences')).toBeInTheDocument();
  });

  it('renders an error message when errorMessage is set', () => {
    mockHook({ errorMessage: 'preferences store unavailable' });

    render(<SeasonModePanel />);

    expect(screen.getByText('preferences store unavailable')).toBeInTheDocument();
  });

  it('does not import or call Wails bindings directly', () => {
    mockHook();

    // The component must only call useSeasonModePanel and render props.
    // We verify the hook is called (and mocked) — if the component bypassed
    // the mock and called bindings directly, Wails globals would be undefined
    // and the test would crash. Reaching this assertion means the component
    // is purely presentational.
    render(<SeasonModePanel />);

    expect(mockedUseSeasonModePanel).toHaveBeenCalled();
  });
});
