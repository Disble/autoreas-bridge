import { Chip, Typography } from '@heroui/react';
import { Link } from 'react-router';
import { CatalogCoverSlot } from './CatalogCoverSlot';
import { CATALOG_COVER_FRAME_CLASS } from './catalog-panel.constants';
import { toCatalogDetailPath } from './catalog-panel.helpers';
import type { CatalogItemProps } from './catalog-panel.types';

/** One grid card: the cover, a two-line title, the type and the `estado` chip, all linking to the detail. */
export function CatalogCard({ item, cover, onCoverError }: Readonly<CatalogItemProps>) {
  return (
    <li className="min-w-0">
      <Link className="group flex flex-col gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-4 focus-visible:ring-offset-background" to={toCatalogDetailPath(item.id)}>
        <span className={`${CATALOG_COVER_FRAME_CLASS} rounded-xl ring-1 ring-border transition duration-200 ease-out motion-reduce:transition-none group-hover:-translate-y-0.75 group-hover:shadow-xl`}>
          <CatalogCoverSlot animeId={item.id} cover={cover} size="card" onCoverError={onCoverError} />
        </span>
        <span className="flex min-w-0 flex-col px-0.5">
          <Typography className="line-clamp-2" title={item.name} type="body" weight="semibold">{item.name}</Typography>
          <Typography className="mt-1" color="muted" truncate type="body-sm">{item.kindLabel}</Typography>
          <span className="mt-2 flex">
            <Chip color={item.statusColor} size="sm" variant="soft"><Chip.Label>{item.statusLabel}</Chip.Label></Chip>
          </span>
        </span>
      </Link>
    </li>
  );
}
