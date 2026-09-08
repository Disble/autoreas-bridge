import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LoadingBars } from '../LoadingBars';

describe('LoadingBars', () => {
  afterEach(cleanup);

  it('renders exactly `count` placeholder bars', () => {
    render(<LoadingBars count={3} label="Loading hoster priority" />);

    expect(screen.getAllByTestId('loading-bars-bar')).toHaveLength(3);
  });

  it('renders a single bar when count is 1', () => {
    render(<LoadingBars count={1} label="Loading episode rename setting" />);

    expect(screen.getAllByTestId('loading-bars-bar')).toHaveLength(1);
  });

  it('announces loading through a named status region', () => {
    render(<LoadingBars count={3} label="Loading hoster priority" />);

    expect(screen.getByRole('status', { name: 'Loading hoster priority' })).toBeInTheDocument();
  });

  it('forwards `className` to the status region', () => {
    render(<LoadingBars className="custom-class" count={2} label="Loading schedule configuration" />);

    expect(screen.getByRole('status', { name: 'Loading schedule configuration' })).toHaveClass('custom-class');
  });

  it('applies a custom `barClassName` to every bar', () => {
    render(<LoadingBars barClassName="h-40 w-full rounded-lg" count={1} label="Loading season" />);

    expect(screen.getByTestId('loading-bars-bar')).toHaveClass('h-40');
  });

  it('gives each instance its own status region id, so two instances on the same page do not collide', () => {
    render(
      <>
        <LoadingBars count={1} label="Loading hoster priority" />
        <LoadingBars count={1} label="Loading download run history" />
      </>,
    );

    expect(screen.getByRole('status', { name: 'Loading hoster priority' })).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Loading download run history' })).toBeInTheDocument();
  });
});
