import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { LookupCandidateSkeleton } from '../LookupCandidateSkeleton';

describe('LookupCandidateSkeleton', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders exactly LOOKUP_SKELETON_ROW_COUNT placeholder rows', () => {
    render(<LookupCandidateSkeleton />);

    expect(screen.getAllByTestId('lookup-skeleton-row')).toHaveLength(5);
  });

  it('renders no accessible text of its own -- the region around it must carry the announcement', () => {
    render(<LookupCandidateSkeleton />);

    expect(screen.getAllByTestId('lookup-skeleton-row')[0]).toHaveTextContent('');
  });
});
