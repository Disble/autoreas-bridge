import type { RunHistoryManualLinksProps } from './run-history-panel.types';

/**
 * Renders the manual-download links a `jd_offline` run recorded, or nothing
 * when the run carries none. Split out of `RunHistoryDetailPane` because its
 * nested per-link list is the detail pane's own JSX-depth offender.
 */
export function RunHistoryManualLinks({ manualLinks }: Readonly<RunHistoryManualLinksProps>) {
  if (manualLinks === undefined || manualLinks.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-foreground">Manual links (JDownloader was offline)</span>
      <ul className="flex flex-col gap-2">
        {manualLinks.map((link) => (
          <li key={`${link.anime}-${link.episode}`} className="min-w-0 rounded-lg border border-divider/60 p-2">
            <p className="font-medium text-foreground">
              <span>{link.anime}</span> — Episode {link.episode}
            </p>
            {/*
             * Hoster URLs are long, unbroken tokens. Without break-all they
             * push the card wider than its column and put a horizontal
             * scrollbar on the whole window.
             */}
            <ul className="flex min-w-0 flex-col gap-1">
              {link.links.map((url) => (
                <li key={url} className="min-w-0">
                  <a className="block break-all text-primary underline" href={url} rel="noreferrer" target="_blank">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
