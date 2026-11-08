import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityFeedSource } from '../../feed-source/feed-source.types';
import type { ActivityFeedLine } from '../../feed-source/feed.types';
import { formatDrawerWhen } from '../drawer-format.helpers';
import { toDrawerLineKey } from '../drawer-reads.helpers';
import { useDrawerStoredReport } from '../use-drawer-stored-report';
import { bridgeOffLine, feedLine, readingLine, syncReading, tabletSummary } from './drawer.fixtures';

/** A feed source whose only read is the given stored report read. */
function feedWith(getPhoneReport: ActivityFeedSource['getPhoneReport']): ActivityFeedSource {
  return { getPhoneReport } as unknown as ActivityFeedSource;
}

/** Renders the hook over a line, on the Data tab unless told otherwise. */
function renderReport(feed: ActivityFeedSource, line: ActivityFeedLine, shown = true) {
  return renderHook((props: { readonly line: ActivityFeedLine; readonly shown: boolean }) => useDrawerStoredReport(feed, props.line, toDrawerLineKey(props.line), props.shown), {
    initialProps: { line, shown },
  });
}

/** A group of two reports, newest arrival first. */
const GROUP = bridgeOffLine([syncReading({ reportId: 9, reading: 'bridge_off' }), syncReading({ reportId: 8, reading: 'bridge_off' })]);

describe('useDrawerStoredReport', () => {
  it('offers a plain report nothing and reads nothing', () => {
    const getPhoneReport = vi.fn(() => Promise.resolve('{}'));
    const line = feedLine({ failed: true }, { kind: 'phone_report', id: '41' });

    const { result } = renderReport(feedWith(getPhoneReport), line);

    expect(result.current).toMatchObject({ reports: [], selectedReportId: undefined, reportStatus: undefined, reportJson: undefined });
    expect(getPhoneReport).not.toHaveBeenCalled();
  });

  it('reads nothing until the Data tab is shown, then the report of the line', async () => {
    const getPhoneReport = vi.fn(() => Promise.resolve('{"failed":true}'));
    const line = readingLine(syncReading({ reportId: 41 }));
    const { result, rerender } = renderReport(feedWith(getPhoneReport), line, false);

    expect(result.current.reportStatus).toBeUndefined();
    expect(getPhoneReport).not.toHaveBeenCalled();

    rerender({ line, shown: true });

    expect(result.current.reportStatus).toBe('loading');
    await waitFor(() => expect(result.current.reportStatus).toBe('ready'));
    expect(getPhoneReport).toHaveBeenCalledExactlyOnceWith(41);
    expect(result.current.reportJson).toBe('{"failed":true}');
  });

  it('labels each report of a group with its times, in order, and reads only the shown one', async () => {
    const getPhoneReport = vi.fn((id: number) => Promise.resolve(`{"id":${id}}`));
    const { result } = renderReport(feedWith(getPhoneReport), GROUP);
    const { failedAtMs, arrivedAtMs } = syncReading().evidence;

    expect(result.current.reports.map((report) => report.id)).toEqual([9, 8]);
    expect(result.current.reports[0]?.label).toBe(`Failed at ${formatDrawerWhen(failedAtMs)} · Arrived ${formatDrawerWhen(arrivedAtMs)}`);
    await waitFor(() => expect(result.current.reportJson).toBe('{"id":9}'));
    expect(getPhoneReport).toHaveBeenCalledExactlyOnceWith(9);

    act(() => {
      result.current.pickReport(8);
    });

    expect(result.current.selectedReportId).toBe(8);
    await waitFor(() => expect(result.current.reportJson).toBe('{"id":8}'));
    expect(getPhoneReport).toHaveBeenCalledTimes(2);
  });

  it('offers a traffic hour the summary each device reported, labelled by device and arrival, and reads the first', async () => {
    const getPhoneReport = vi.fn((id: number) => Promise.resolve(`{"id":${id}}`));
    const tablets = [tabletSummary(), tabletSummary({ reportId: 13, deviceId: 'device-2' })];
    const line = feedLine({ type: 'traffic', origin: 'phone', tabletSummaries: tablets }, { kind: 'traffic_hour', id: '1' });

    const { result } = renderReport(feedWith(getPhoneReport), line);

    expect(result.current.reports).toEqual([
      { id: 12, label: `device-1 · Received ${formatDrawerWhen(tablets[0].receivedAtMs)}` },
      { id: 13, label: `device-2 · Received ${formatDrawerWhen(tablets[0].receivedAtMs)}` },
    ]);
    await waitFor(() => expect(result.current.reportJson).toBe('{"id":12}'));
    expect(getPhoneReport).toHaveBeenCalledExactlyOnceWith(12);
  });

  it('forgets a pick on another line, even one holding the same report', async () => {
    const { result, rerender } = renderReport(feedWith(() => Promise.resolve('{}')), GROUP);
    act(() => {
      result.current.pickReport(8);
    });

    rerender({ line: bridgeOffLine([syncReading({ reportId: 7 }), syncReading({ reportId: 8 })], 5), shown: true });

    expect(result.current.selectedReportId).toBe(7);
    await waitFor(() => expect(result.current.reportStatus).toBe('ready'));
  });

  it('turns a report no longer stored into gone, with no payload', async () => {
    const { result } = renderReport(feedWith(() => Promise.resolve(undefined)), readingLine(syncReading()));

    await waitFor(() => expect(result.current.reportStatus).toBe('gone'));
    expect(result.current.reportJson).toBeUndefined();
  });

  it('reports a failed read and reads again from Try again', async () => {
    const getPhoneReport = vi.fn<ActivityFeedSource['getPhoneReport']>().mockRejectedValueOnce(new Error('db')).mockResolvedValueOnce('{}');
    const { result } = renderReport(feedWith(getPhoneReport), readingLine(syncReading()));

    await waitFor(() => expect(result.current.reportStatus).toBe('failed'));

    act(() => {
      result.current.retryReport();
    });

    await waitFor(() => expect(result.current.reportStatus).toBe('ready'));
    expect(result.current.reportJson).toBe('{}');
  });
});
