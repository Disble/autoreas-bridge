import { useParams } from 'react-router';
import { AnimeDetail } from '../../features/anime-detail/ui/AnimeDetail/AnimeDetail';

/**
 * Thin composition route: reads the `:id` param and renders the shared
 * AnimeDetail feature. Reachable from both Catalog and History
 * (`/catalog/detail/:id`) so the two lenses converge on one implementation.
 */
export function AnimeDetailRoute() {
  const { id } = useParams<{ id: string }>();

  if (id === undefined) {
    return null;
  }

  return <AnimeDetail animeId={id} />;
}
