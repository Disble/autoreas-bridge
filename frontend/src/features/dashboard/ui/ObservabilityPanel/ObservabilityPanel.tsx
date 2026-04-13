import { Card, Chip, ScrollShadow, Separator } from '@heroui/react';
import { formatMetadataLabel, getLogLevelColor } from './observability-panel.helpers';
import { useObservabilityPanel } from './use-observability-panel';

export function ObservabilityPanel() {
  const { entries } = useObservabilityPanel();

  return (
    <Card className="w-full">
      <Card.Header>
        <Card.Title>Observability</Card.Title>
        <Card.Description>Bridge runtime log feed</Card.Description>
      </Card.Header>
      <Card.Content className="p-0">
        <ScrollShadow className="max-h-[32rem] px-4 pb-4 2xl:max-h-[40rem]" hideScrollBar>
          <div className="flex max-h-[32rem] flex-col gap-2 overflow-y-auto 2xl:max-h-[40rem]">
            {entries.length === 0 ? (
              <div className="py-4 text-center">
                <Chip color="default" variant="soft">No logs yet</Chip>
              </div>
            ) : (
              entries.map(({ entry, metadataEntries, summaryLabels }, index) => (
                <div key={`${entry.timestamp}-${entry.domain}-${entry.level ?? 'none'}-${entry.message}-${entry.eventType ?? 'none'}-${entry.entityId ?? 'none'}-${entry.correlationId ?? 'none'}`}>
                  <div className="grid gap-2 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Chip color="default" size="sm" variant="tertiary">{entry.timestamp}</Chip>
                      <Chip color="default" size="sm" variant="secondary">{entry.domain}</Chip>
                      {entry.level ? (
                        <Chip color={getLogLevelColor(entry.level)} size="sm" variant="soft">{entry.level}</Chip>
                      ) : null}
                    </div>

                    <div className="grid gap-1">
                      <span className="text-sm font-medium text-foreground sm:text-[0.95rem]">{entry.message}</span>

                      {summaryLabels.length > 0 ? (
                        <div className="flex flex-wrap items-center gap-2">
                          {summaryLabels.map((label) => (
                            <Chip key={`${entry.timestamp}-${label}`} color="default" size="sm" variant="soft">{label}</Chip>
                          ))}
                        </div>
                      ) : null}
                    </div>

                    {metadataEntries.length > 0 ? (
                      <div className="grid gap-2 rounded-xl border border-white/5 bg-white/[0.02] p-3 sm:grid-cols-2">
                        {metadataEntries.map(([key, value]) => (
                          <div key={`${entry.timestamp}-${key}-${value}`} className="min-w-0 rounded-lg bg-black/10 px-2 py-1.5">
                            <span className="block truncate text-xs text-default-500">{key}</span>
                            <span className="block break-all text-sm text-foreground">{formatMetadataLabel(key, value)}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {index < entries.length - 1 ? <Separator /> : null}
                </div>
              ))
            )}
          </div>
        </ScrollShadow>
      </Card.Content>
    </Card>
  );
}
