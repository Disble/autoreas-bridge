import plusIcon from '@iconify-icons/tabler/plus';
import { Icon } from '@iconify/react';
import { Button, Typography } from '@heroui/react';
import { AIRIS_CREATE_ANIME_LABEL } from '../../../../shared/ui/AirisEmptyState/airis-empty-state.constants';
import { CatalogBody } from './CatalogBody';
import { CatalogResultLine } from './CatalogResultLine';
import { CatalogToolbar } from './CatalogToolbar';
import { useCatalogPanel } from './use-catalog-panel';

/**
 * The Catalog screen: a header with Create, the search/filter/sort/view
 * toolbar, the result line, and the anime as cover cards or compact rows.
 * Only the results pane scrolls, so the progressive window grows as it nears
 * the bottom while the controls stay in reach.
 */
export function CatalogPanel() {
  const state = useCatalogPanel();
  const { error, isLoading, listWindow } = state;

  return (
    <section aria-labelledby="catalog-title" className="mx-auto flex h-[calc(100dvh-7rem)] min-h-[32rem] w-full max-w-[1240px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <Typography id="catalog-title" type="h1">Catalog</Typography>
        {state.hasCatalog ? (
          <Button aria-label={AIRIS_CREATE_ANIME_LABEL} variant="primary" onPress={state.onCreate}>
            <Icon aria-hidden="true" className="size-4" icon={plusIcon} />
            Create
          </Button>
        ) : null}
      </header>

      {state.hasCatalog ? (
        <>
          <CatalogToolbar state={state} />
          {isLoading || error !== undefined ? null : <CatalogResultLine state={state} />}
        </>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto pb-2" data-testid="catalog-results-scroll" onScroll={listWindow.onScroll} ref={listWindow.scrollRef}>
        <CatalogBody state={state} />
      </div>
    </section>
  );
}
