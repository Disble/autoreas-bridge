import { Chip } from '@heroui/react';
import { Link } from 'react-router';
import { CATALOG_LIST_ROW_CLASS } from './catalog-panel.constants';
import type { CatalogListRowProps } from './catalog-panel.types';

/**
 * One row of the Catalog's anime list: name, progress, and status/gap chips.
 * Extracted from `CatalogPanel` so `CatalogListSkeleton` has a real row to
 * mirror and measure against.
 */
export function CatalogListRow({ item }: Readonly<CatalogListRowProps>) {
  return (
    <li className={CATALOG_LIST_ROW_CLASS}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Link className="min-w-0 flex-1" to={`/catalog/detail/${item.id}`}>
          <h3 className="truncate text-sm font-semibold text-foreground">{item.nombre}</h3>
          <p className="mt-1 text-xs text-muted">{item.progressLabel}</p>
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {item.hasDownloadGap ? (
            <Chip
              color="warning"
              data-testid={`anime-gap-${item.id}`}
              size="sm"
              variant="soft"
            >
              <Chip.Label>{item.gapLabel}</Chip.Label>
            </Chip>
          ) : null}
          <Chip
            color={item.status === 'active' ? 'success' : 'default'}
            data-testid={`anime-status-${item.id}`}
            size="sm"
            variant="soft"
          >
            <Chip.Label>{item.statusLabel}</Chip.Label>
          </Chip>
        </div>
      </div>
    </li>
  );
}
