import { Card, Chip, ScrollShadow } from '@heroui/react';
import { formatTimestamp, getDomainColor, getLogLevelAccentClass, getLogLevelColor } from './observability-panel.helpers';
import { useObservabilityPanel } from './use-observability-panel';

export function ObservabilityPanel() {
  const { entries } = useObservabilityPanel();

  return (
    <Card className="w-full">
      <Card.Content className="p-0">
        <ScrollShadow className="max-h-[32rem] p-3 2xl:max-h-[40rem]" hideScrollBar>
          <div className="flex flex-col gap-1">
            {entries.length === 0 ? (
              <div className="py-10 text-center text-default-400">
                <span className="text-sm">Waiting for runtime events&hellip;</span>
              </div>
            ) : (
              entries.map(({ entry, metadataEntries, summaryLabels }) => (
                <div
                  key={`${entry.timestamp}-${entry.domain}-${entry.level ?? 'none'}-${entry.message}-${entry.eventType ?? 'none'}-${entry.entityId ?? 'none'}-${entry.correlationId ?? 'none'}`}
                  className={`border-l-2 ${getLogLevelAccentClass(entry.level)} rounded-r-lg py-2 pr-3 pl-3 transition-colors hover:bg-white/[0.03]`}
                >
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs text-default-500">{formatTimestamp(entry.timestamp)}</span>
                    <Chip color={getDomainColor(entry.domain)} size="sm" variant="soft">{entry.domain}</Chip>
                    {entry.level ? (
                      <Chip color={getLogLevelColor(entry.level)} size="sm" variant="soft">{entry.level}</Chip>
                    ) : null}
                  </div>

                  <p className="mt-1 text-sm font-medium text-foreground">{entry.message}</p>

                  {summaryLabels.length > 0 ? (
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      {summaryLabels.map((label) => (
                        <Chip key={`${entry.timestamp}-${label}`} color="default" size="sm" variant="tertiary">{label}</Chip>
                      ))}
                    </div>
                  ) : null}

                  {metadataEntries.length > 0 ? (
                    <div className="mt-2 grid gap-1.5 rounded-lg border border-white/5 bg-white/[0.02] p-2.5 sm:grid-cols-2">
                      {metadataEntries.map(([key, value]) => (
                        <div key={`${entry.timestamp}-${key}-${value}`} className="min-w-0">
                          <span className="block truncate text-xs text-default-500">{key}</span>
                          <span className="block break-all text-sm text-foreground">{value}</span>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </ScrollShadow>
      </Card.Content>
    </Card>
  );
}
