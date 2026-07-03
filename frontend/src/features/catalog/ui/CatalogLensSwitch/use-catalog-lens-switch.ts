import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { deriveCatalogLensFromPath, resolveCatalogLensPath } from './catalog-lens-switch.helpers';
import type { CatalogLens, CatalogLensSwitchProps, CatalogLensSwitchState } from './catalog-lens-switch.types';

/**
 * Drives the segmented Catalog/History control: derives the active lens
 * from the current route and navigates on selection. Mounted only on
 * `/catalog` and `/catalog/history` (by the host routes), so pathnames
 * outside that pair never reach this hook in practice.
 */
export function useCatalogLensSwitch(
  _props: Readonly<CatalogLensSwitchProps>,
): CatalogLensSwitchState {
  // 1. Refs

  // 2. State

  // 3. Context/3rd Party Hooks
  const location = useLocation();
  const navigate = useNavigate();

  // 4. Queries/Mutations

  // 5. Derived State (useMemo)
  const activeLens = useMemo(() => deriveCatalogLensFromPath(location.pathname), [location.pathname]);

  // 6. Callbacks (useCallback calling pure helpers)
  const onLensChange = useCallback(
    (lens: CatalogLens) => {
      navigate(resolveCatalogLensPath(lens));
    },
    [navigate],
  );

  // 7. Effects

  return {
    activeLens,
    onLensChange,
  };
}
