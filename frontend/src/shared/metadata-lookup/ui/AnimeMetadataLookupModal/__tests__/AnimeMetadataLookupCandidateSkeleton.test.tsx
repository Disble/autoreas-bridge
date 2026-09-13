import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { AnimeMetadataLookupCandidateSkeleton } from '../AnimeMetadataLookupCandidateSkeleton';

describe('AnimeMetadataLookupCandidateSkeleton', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders exactly METADATA_LOOKUP_SKELETON_ROW_COUNT placeholder rows', () => {
    render(<AnimeMetadataLookupCandidateSkeleton />);

    expect(screen.getAllByTestId('metadata-lookup-skeleton-row')).toHaveLength(5);
  });

  it('renders no accessible text of its own -- the region around it must carry the announcement', () => {
    render(<AnimeMetadataLookupCandidateSkeleton />);

    expect(screen.getAllByTestId('metadata-lookup-skeleton-row')[0]).toHaveTextContent('');
  });
});
