/**
 * Maps the season mode boolean to its display label.
 * Returns "Activado" when season mode is enabled, "Desactivado" when disabled.
 */
export function getSeasonModeLabel(enabled: boolean): string {
  return enabled ? 'Activado' : 'Desactivado';
}
