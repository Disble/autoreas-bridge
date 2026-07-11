/**
 * Builds the desktop rail link class name for a navigation item.
 * This keeps route-state styling out of the composition-only shell component.
 */
export function railItemClass({ isActive }: Readonly<{ isActive: boolean }>): string {
  return [
    'group/item relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm outline-none transition-colors',
    'focus-visible:ring-2 focus-visible:ring-primary/60',
    isActive
      ? 'bg-primary/15 text-primary font-medium'
      : 'text-muted hover:bg-content2/60 hover:text-foreground',
  ].join(' ');
}

/**
 * Builds the mobile tab link class name for a navigation item.
 * This preserves the existing active-state behavior while keeping JSX lean.
 */
export function tabItemClass({ isActive }: Readonly<{ isActive: boolean }>): string {
  return [
    'flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] transition-colors',
    isActive ? 'text-primary' : 'text-muted hover:text-foreground',
  ].join(' ');
}
