import type { ActivityTechnicalHeadersProps } from './activity-technical-view.types';

/**
 * The stored headers of one side of the picked request (`.ax-hdrs`): names
 * muted, values as stored, a masked credential shown masked. Nothing renders
 * when none were captured.
 */
export function ActivityTechnicalHeaders({ label, headers }: ActivityTechnicalHeadersProps) {
  if (headers.length === 0) {
    return null;
  }
  return (
    <dl aria-label={label} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 font-mono text-xs">
      {headers.map((header) => (
        <div className="contents" key={header.name}>
          <dt className="text-muted">{header.name}</dt>
          <dd className="text-foreground [overflow-wrap:anywhere]">{header.value}</dd>
        </div>
      ))}
    </dl>
  );
}
