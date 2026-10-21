import type { AnimeDetailFieldProps } from './anime-detail.types';

/** One General data field: a muted caption over its value; wide fields span every column. */
export function AnimeDetailField({ children, isWide = false, label }: Readonly<AnimeDetailFieldProps>) {
  return (
    <div className={isWide ? 'col-span-full flex min-w-0 flex-col gap-1' : 'flex min-w-0 flex-col gap-1'}>
      <dt className="text-xs font-semibold text-muted">{label}</dt>
      <dd className="m-0 text-sm leading-normal [overflow-wrap:anywhere] text-foreground">{children}</dd>
    </div>
  );
}
