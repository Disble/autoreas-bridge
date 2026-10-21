import chevronRightIcon from '@iconify-icons/tabler/chevron-right';
import { Icon } from '@iconify/react';
import { Chip, Typography } from '@heroui/react';
import { Link } from 'react-router';
import { CatalogCoverSlot } from './CatalogCoverSlot';
import { CATALOG_COVER_FRAME_CLASS, CATALOG_LIST_ROW_CLASS } from './catalog-panel.constants';
import { toCatalogDetailPath } from './catalog-panel.helpers';
import type { CatalogItemProps } from './catalog-panel.types';

/** One compact list row: a 40px cover, the title, "Type · genres", the `estado` chip and a chevron. */
export function CatalogListRow({ item, cover, onCoverError }: Readonly<CatalogItemProps>) {
  return (
    <li className="min-w-0 [&+&]:border-t [&+&]:border-separator">
      <Link className={`${CATALOG_LIST_ROW_CLASS} group outline-none transition-colors hover:bg-surface-secondary focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-inset`} to={toCatalogDetailPath(item.id)}>
        <span className={`${CATALOG_COVER_FRAME_CLASS} rounded-md`}>
          <CatalogCoverSlot animeId={item.id} cover={cover} size="thumb" onCoverError={onCoverError} />
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <Typography truncate type="body" weight="semibold">{item.name}</Typography>
          <Typography color="muted" truncate type="body-sm">{item.listMeta}</Typography>
        </span>
        <span className="col-start-2 flex sm:col-start-auto">
          <Chip color={item.statusColor} size="sm" variant="soft"><Chip.Label>{item.statusLabel}</Chip.Label></Chip>
        </span>
        <Icon aria-hidden="true" className="hidden size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-foreground sm:block" icon={chevronRightIcon} />
      </Link>
    </li>
  );
}
