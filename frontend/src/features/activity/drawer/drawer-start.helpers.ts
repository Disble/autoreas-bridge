import { DRAWER_EVIDENCE_NOT_RECORDED, DRAWER_START_WORDS } from './drawer.constants';
import type { DrawerSection, DrawerSummaryInput } from './drawer.types';
import { drawerFact, formatDrawerSpan, formatDrawerWhen } from './drawer-format.helpers';

/**
 * How the run before a Bridge start ended (S6 P5): its close and how long
 * Bridge was off, the last event of a run that did not close normally, or an
 * unknown close before any close was recorded.
 *
 * @param input The summary input.
 * @returns The sections; empty for a line that is not a start.
 */
export function bridgeStartSections(input: DrawerSummaryInput): readonly DrawerSection[] {
  const start = input.line.bridgeStart;
  if (start === undefined) {
    return [];
  }
  const { closedAtMs, lastEventAtMs } = start;
  if (closedAtMs !== undefined) {
    const rows = [drawerFact('closed', DRAWER_START_WORDS.closed, formatDrawerWhen(closedAtMs)), drawerFact('off', DRAWER_START_WORDS.offFor, formatDrawerSpan(input.line.line.atMs - closedAtMs))];
    return [{ kind: 'facts', key: 'start', title: '', rows }];
  }
  if (lastEventAtMs === undefined) {
    return [{ kind: 'facts', key: 'start', title: '', rows: [drawerFact('closed', DRAWER_START_WORDS.closed, DRAWER_START_WORDS.unknown)] }];
  }
  const rows = [drawerFact('closed', DRAWER_START_WORDS.closed, DRAWER_EVIDENCE_NOT_RECORDED), drawerFact('last', DRAWER_START_WORDS.lastEvent, formatDrawerWhen(lastEventAtMs))];
  return [
    { kind: 'facts', key: 'start', title: '', rows },
    { kind: 'text', key: 'not-closed', text: DRAWER_START_WORDS.notClosed },
  ];
}
