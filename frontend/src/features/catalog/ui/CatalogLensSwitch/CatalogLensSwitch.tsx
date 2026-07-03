import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { CATALOG_LENS_SWITCH_LABEL, CATALOG_LENS_SWITCH_LABELS } from './catalog-lens-switch.constants';
import type { CatalogLens, CatalogLensSwitchProps } from './catalog-lens-switch.types';
import { useCatalogLensSwitch } from './use-catalog-lens-switch';

/**
 * Segmented control switching between the Catalog and History lenses over
 * the same anime set. Colocated under `features/catalog/` (host lens
 * switcher) but owned by neither lens; renders only on `/catalog` and
 * `/catalog/history` (the host routes choose not to mount it on the shared
 * detail route).
 */
export function CatalogLensSwitch(props: Readonly<CatalogLensSwitchProps>) {
  const { activeLens, onLensChange } = useCatalogLensSwitch(props);

  return (
    <ToggleButtonGroup
      aria-label={CATALOG_LENS_SWITCH_LABEL}
      className={props.className}
      disallowEmptySelection
      isDetached
      onSelectionChange={(keys) => {
        const [first] = keys;

        if (first !== undefined) {
          onLensChange(String(first) as CatalogLens);
        }
      }}
      selectedKeys={[activeLens]}
      selectionMode="single"
      size="sm"
    >
      <ToggleButton id="catalog">{CATALOG_LENS_SWITCH_LABELS.catalog}</ToggleButton>
      <ToggleButton id="history">{CATALOG_LENS_SWITCH_LABELS.history}</ToggleButton>
    </ToggleButtonGroup>
  );
}
