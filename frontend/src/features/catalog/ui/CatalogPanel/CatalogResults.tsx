import { Card, Typography } from '@heroui/react';
import { CatalogCard } from './CatalogCard';
import { CatalogListRow } from './CatalogListRow';
import { CATALOG_GRID_CLASS, CATALOG_RESULTS_LABEL } from './catalog-panel.constants';
import { formatCatalogFooter } from './catalog-panel.helpers';
import type { CatalogSectionProps } from './catalog-panel.types';

/** The revealed slice of matching anime in the active view, with the footer saying whether more follow. */
export function CatalogResults({ state }: Readonly<CatalogSectionProps>) {
  const { items, getCover, onCoverError } = state;

  return (
    <>
      {state.view === 'grid' ? (
        <ul aria-label={CATALOG_RESULTS_LABEL} className={CATALOG_GRID_CLASS}>
          {items.map((item) => <CatalogCard cover={getCover(item)} item={item} key={item.id} onCoverError={onCoverError} />)}
        </ul>
      ) : (
        <Card className="p-2">
          <ul aria-label={CATALOG_RESULTS_LABEL}>
            {items.map((item) => <CatalogListRow cover={getCover(item)} item={item} key={item.id} onCoverError={onCoverError} />)}
          </ul>
        </Card>
      )}
      <Typography align="center" className="pt-6 text-xs" color="muted" type="body-sm">{formatCatalogFooter(items.length, state.matchingCount)}</Typography>
    </>
  );
}
