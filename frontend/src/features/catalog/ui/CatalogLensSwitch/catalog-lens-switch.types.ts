/** Which lens over the shared anime catalog is currently active. */
export type CatalogLens = 'catalog' | 'history';

/** Props for the segmented Catalog/History lens switch. */
export interface CatalogLensSwitchProps {
  readonly className?: string;
}

/** State returned by `useCatalogLensSwitch`. */
export interface CatalogLensSwitchState {
  readonly activeLens: CatalogLens;
  readonly onLensChange: (lens: CatalogLens) => void;
}
