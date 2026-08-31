import { describe, expect, it } from 'vitest';
import type { RuntimeEventRow } from '../../../../../shared/store/network-store/network-store.types';
import { getNetworkPanelSelection } from '../network-panel.helpers';

/**
 * The metadata projection of `network-panel.helpers`, driven through the public
 * selection seam that owns it.
 *
 * Split out of `network-panel.helpers.test.ts` because that file is already at
 * 324 effective lines and this suite would push it past the project's 400-line
 * warning. Metadata is `map[string]any` on the Go side and the store recurses
 * into nested maps on purpose, so a nested value is legitimate data — the
 * defect this suite pins is a projection that flattened every one of them to
 * `[object Object]`.
 */

/** Epoch millis for `2026-06-20T10:30:45Z`, the instant every fixture row is stamped with. */
const FIXTURE_MS = Date.parse('2026-06-20T10:30:45Z');

/** The id the fixture row and the selection lookup agree on. */
const FIXTURE_ID = 'event-metadata';

/** The real `probes` array shape a download event carries, pretty-printed. */
const EXPECTED_PROBES_JSON = [
  '[',
  '  {',
  '    "host": "jd-01",',
  '    "reachable": true',
  '  },',
  '  {',
  '    "host": "jd-02",',
  '    "reachable": false',
  '  }',
  ']',
].join('\n');

/** A nested metadata map, pretty-printed. */
const EXPECTED_DEVICE_JSON = ['{', '  "name": "Phone",', '  "online": true', '}'].join('\n');

/** Builds one persisted feed row carrying the metadata under test. */
function row(metadata: Readonly<Record<string, unknown>>): RuntimeEventRow {
  return {
    id: FIXTURE_ID,
    occurredAtMs: FIXTURE_MS,
    domain: 'download',
    level: 'info',
    message: 'probing jdownloader devices',
    eventType: 'download.probe',
    metadata,
  };
}

/** Projects one metadata map into the detail inspector's metadata rows. */
function project(metadata: Readonly<Record<string, unknown>>) {
  const selected = row(metadata);

  return getNetworkPanelSelection([selected], FIXTURE_ID, []).selectedDetail?.metadataEntries ?? [];
}

/** Reads the projected value for one metadata key. */
function valueOf(metadata: Readonly<Record<string, unknown>>, key: string): string | undefined {
  return project(metadata).find((entry) => entry.key === key)?.value;
}

describe('metadata value projection', () => {
  it('renders a string value unchanged', () => {
    expect(valueOf({ path: '/api/status' }, 'path')).toBe('/api/status');
  });

  it('renders a number value as its decimal text', () => {
    expect(valueOf({ attempts: 3 }, 'attempts')).toBe('3');
  });

  it('renders a boolean value as its literal text', () => {
    expect(valueOf({ reachable: false }, 'reachable')).toBe('false');
  });

  it('renders a non-finite number as the number it is rather than a serialized null', () => {
    expect(valueOf({ ratio: Number.NaN }, 'ratio')).toBe('NaN');
  });

  it('renders an infinite number as its own text for the same reason', () => {
    expect(valueOf({ ratio: Number.POSITIVE_INFINITY }, 'ratio')).toBe('Infinity');
  });

  it('renders a null value as the Null Object em-dash rather than the word "null"', () => {
    expect(valueOf({ deviceId: null }, 'deviceId')).toBe('—');
  });

  it('renders an undefined value as the Null Object em-dash', () => {
    expect(valueOf({ deviceId: undefined }, 'deviceId')).toBe('—');
  });

  it('renders a nested map as indented JSON instead of "[object Object]"', () => {
    expect(valueOf({ device: { name: 'Phone', online: true } }, 'device')).toBe(EXPECTED_DEVICE_JSON);
  });

  it('renders an array of objects — the real "probes" shape — as indented JSON', () => {
    const probes = [
      { host: 'jd-01', reachable: true },
      { host: 'jd-02', reachable: false },
    ];

    expect(valueOf({ probes }, 'probes')).toBe(EXPECTED_PROBES_JSON);
  });

  it('renders an empty object as its single-line JSON, not the em-dash', () => {
    expect(valueOf({ headers: {} }, 'headers')).toBe('{}');
  });

  it('renders the already-redacted marker the store writes as the plain string it is', () => {
    expect(valueOf({ authorization: '[redacted]' }, 'authorization')).toBe('[redacted]');
  });

  it('falls back instead of throwing when a value holds a cycle', () => {
    const circular: Record<string, unknown> = { host: 'jd-01' };
    circular.self = circular;

    expect(valueOf({ device: circular }, 'device')).toBe('Value could not be displayed.');
  });

  it('falls back instead of throwing when a value cannot be serialized at all', () => {
    expect(valueOf({ size: 9_007_199_254_740_993n }, 'size')).toBe('Value could not be displayed.');
  });

  it('falls back when serialization yields nothing rather than rendering "undefined"', () => {
    expect(valueOf({ onDone: () => undefined }, 'onDone')).toBe('Value could not be displayed.');
  });
});

describe('metadata entry layout flag', () => {
  it('flags a structured value as multiline so the view can render it preformatted', () => {
    expect(project({ device: { name: 'Phone', online: true } })[0]?.isMultiline).toBe(true);
  });

  it('leaves a primitive value single-line', () => {
    expect(project({ attempts: 3 })[0]?.isMultiline).toBe(false);
  });

  it('flags a plain string that already carries newlines as multiline', () => {
    expect(project({ stack: 'first line\nsecond line' })[0]?.isMultiline).toBe(true);
  });
});

describe('metadata ordering', () => {
  it('sorts entries by key so the inspector renders a deterministic order', () => {
    const entries = project({ status: 200, method: 'GET', path: '/api/status' });

    expect(entries).toEqual([
      { key: 'method', value: 'GET', isMultiline: false },
      { key: 'path', value: '/api/status', isMultiline: false },
      { key: 'status', value: '200', isMultiline: false },
    ]);
  });

  it('projects an absent metadata map as no entries at all', () => {
    const selected: RuntimeEventRow = {
      id: FIXTURE_ID,
      occurredAtMs: FIXTURE_MS,
      domain: 'download',
      level: 'info',
      message: 'probing jdownloader devices',
    };

    expect(getNetworkPanelSelection([selected], FIXTURE_ID, []).selectedDetail?.metadataEntries).toEqual([]);
  });
});

describe('metadata truncation marker', () => {
  it('replaces the store marker with a readable notice instead of leaking its internal keys', () => {
    expect(project({ _truncated: true, _original_keys: 12 })).toEqual([
      { key: 'truncated', value: 'Metadata was too large to store, so 12 keys were dropped.', isMultiline: false },
    ]);
  });

  it('reads the notice correctly when a single key was dropped', () => {
    expect(project({ _truncated: true, _original_keys: 1 })[0]?.value).toBe(
      'Metadata was too large to store, so 1 key was dropped.',
    );
  });

  it('leaves ordinary metadata alone when it merely carries a "_truncated" key beside others', () => {
    const entries = project({ _truncated: true, _original_keys: 3, stage: 'probe' });

    expect(entries).toHaveLength(3);
    expect(entries.map((entry) => entry.key)).toContain('_truncated');
  });

  it('leaves ordinary metadata alone when "_truncated" is not the boolean the store writes', () => {
    const entries = project({ _truncated: 'yes', _original_keys: 2 });

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.key)).toContain('_truncated');
  });

  it('leaves ordinary metadata alone when "_original_keys" is not a number', () => {
    const entries = project({ _truncated: true, _original_keys: 'many' });

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.key)).toContain('_original_keys');
  });
});
