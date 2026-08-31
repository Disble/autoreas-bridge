import type {
  NetworkDetailViewModel,
  NetworkMetadataEntryViewModel,
} from '../../src/features/network/ui/NetworkPanel/network-panel.types';
import type { TransactionDetailViewModel } from '../../src/features/network/ui/TransactionPanel/transaction-panel.types';

/**
 * The deliberately hostile content the Activity detail cards are measured
 * against.
 *
 * Every value here is modelled on what the user actually had on screen when the
 * whole application window grew a horizontal scrollbar: a response body that is
 * one unbroken JSON line thousands of characters long, and trace messages
 * carrying full JDownloader API URLs with no break opportunity in them. A
 * fixture fed friendly text would pass on the broken layout too.
 */

/** One unbroken token with no space, hyphen or slash a browser could break at. */
const UNBREAKABLE_TOKEN = `t_${'0f98a1c47b'.repeat(40)}`;

/** The JDownloader URL from the reported Trace tab, kept in its overflowing shape. */
const LONG_URL = `https://api.jdownloader.org/t_01f98a2b3c4d5e6f/device/linkgrabberv2/queryPackages?${UNBREAKABLE_TOKEN}`;

/** Packages in the hostile body; enough that the Pretty view overruns the pane's height too. */
const HOSTILE_PACKAGE_COUNT = 8;

/**
 * A single-line JSON body of several thousand characters.
 *
 * The long value is one unbroken token on purpose: pretty-printing splits a
 * JSON body into lines, so a body that was merely long would be contained by
 * the Pretty view and never exercise the Raw one. This stays a single enormous
 * line in BOTH views, which is the shape that pushed the card past the window.
 *
 * It is also deliberately TALL once pretty-printed. The pane bounds both axes,
 * and a body short enough to fit vertically would let the height bound pass
 * without ever being asked to hold.
 */
const HOSTILE_JSON_BODY = JSON.stringify({
  deviceId: UNBREAKABLE_TOKEN,
  packages: Array.from({ length: HOSTILE_PACKAGE_COUNT }, (_unused, index) => ({
    uuid: `${UNBREAKABLE_TOKEN}-${index}`,
    name: LONG_URL,
    bytesTotal: 4_294_967_296,
  })),
  sessionToken: `${UNBREAKABLE_TOKEN}${UNBREAKABLE_TOKEN}`,
});

/**
 * The same body pretty-printed over many lines.
 *
 * This is the shape a structured metadata value renders in now that nested maps
 * and arrays are JSON-formatted instead of flattened to `[object Object]`. It
 * is both TALL and full of unbreakable tokens, which is exactly the content
 * that reopens the containment the Activity cards closed twice.
 */
const HOSTILE_PRETTY_JSON = JSON.stringify(JSON.parse(HOSTILE_JSON_BODY), null, 2);

/** How many sibling events the Trace tab is measured with; the report showed 14+. */
const TRACE_ENTRY_COUNT = 40;

/** Builds one projected metadata row for a fixture, mirroring what the panel's projection emits. */
function metadataEntry(key: string, value: string): NetworkMetadataEntryViewModel {
  return { key, value, isMultiline: value.includes('\n') };
}

/** The Runtime Events detail, on the Trace tab, with dozens of unbreakable messages. */
export const HOSTILE_NETWORK_DETAIL: NetworkDetailViewModel = {
  entry: {
    id: 'evt-1',
    occurredAtMs: 1_770_000_000_000,
    domain: 'api',
    level: 'error',
    message: `jdownloader: query crawl packages: Post "${LONG_URL}"`,
  },
  timeLabel: '10:30:45.221',
  domain: 'api',
  level: 'error',
  message: `jdownloader: query crawl packages: Post "${LONG_URL}"`,
  hasCorrelation: true,
  fields: [
    ['Correlation', UNBREAKABLE_TOKEN],
    ['Endpoint', LONG_URL],
  ],
  metadataEntries: [metadataEntry('requestUrl', LONG_URL), metadataEntry('sessionToken', UNBREAKABLE_TOKEN)],
  traceEntries: Array.from({ length: TRACE_ENTRY_COUNT }, (_unused, index) => ({
    id: `trace-${index}`,
    timeLabel: '10:30:45.221',
    domain: 'jdownloader',
    message: `jdownloader: query crawl packages: Post "${LONG_URL}": context deadline exceeded`,
    isSelected: index === 0,
  })),
};

/** The Transactions detail, on the Response tab, with the unbroken JSON body. */
export const HOSTILE_TRANSACTION_DETAIL: TransactionDetailViewModel = {
  requestId: UNBREAKABLE_TOKEN,
  methodKind: 'post',
  route: `/api/jdownloader/proxy?target=${LONG_URL}`,
  outcome: 'rejected',
  outcomeColor: 'danger',
  statusLabel: '502',
  statusColor: 'danger',
  hasHttpStatus: true,
  durationLabel: '4210ms',
  timeLabel: '10:30:45',
  deviceName: 'Phone',
  errorCode: 'upstream_unavailable',
  generalFields: [
    { label: 'requestId', value: UNBREAKABLE_TOKEN },
    { label: 'route', value: LONG_URL },
  ],
  requestHeaders: [{ label: 'authorization', value: `Bearer ${UNBREAKABLE_TOKEN}` }],
  responseHeaders: [
    { label: 'content-type', value: 'application/json' },
    { label: 'location', value: LONG_URL },
  ],
  requestPayload: { state: 'captured', raw: HOSTILE_JSON_BODY },
  responseBody: { state: 'captured', raw: HOSTILE_JSON_BODY },
  correlations: [{ label: 'correlationId', value: UNBREAKABLE_TOKEN }],
};

/**
 * The same two details with ORDINARY chrome around the same overrunning panes.
 *
 * They exist because the hostile pair cannot measure whether a pane fills its
 * card. Hostile chrome -- a 470-character message wrapped over `break-words`, a
 * `location` header wrapped over `break-all` -- eats so much of the card that
 * the panes come out at 109px and 133px, well under any fixed cap they might
 * carry, so re-introducing one would not move a single number and a fill guard
 * measured there would pass on the broken layout. Measured: with both
 * `max-h-64` caps restored, every check on the hostile pair stayed green.
 *
 * This is also the shape the defect was reported in: an ordinary header, a pane
 * that stopped after seven rows, and a wide empty band under it.
 */
export const ORDINARY_NETWORK_DETAIL: NetworkDetailViewModel = {
  ...HOSTILE_NETWORK_DETAIL,
  message: 'jdownloader: query crawl packages failed',
  fields: [
    ['Correlation', 'c-4821'],
    ['Endpoint', '/linkgrabberv2/queryPackages'],
  ],
};

/** How many metadata entries the Metadata tab is measured with; more than any card can show at once. */
const METADATA_ENTRY_COUNT = 40;

/**
 * Ordinary chrome with a Metadata tab longer than the card is tall.
 *
 * The General and Metadata tabs have no scrollable pane inside them, so they
 * are the ones that can run out of the BOTTOM of the card now that the card
 * carries a height budget -- and `.card` clips nothing. The other fixtures
 * cannot catch that: they are pinned to tabs whose pane already scrolls.
 *
 * The pretty-printed value leads deliberately. A structured metadata value is
 * a multi-line, `whitespace-pre-wrap` block of unbreakable tokens, which is a
 * different threat from the 40 single-line URLs beneath it: it is the one that
 * can grow the grid cell in BOTH axes at once.
 */
export const METADATA_HEAVY_NETWORK_DETAIL: NetworkDetailViewModel = {
  ...ORDINARY_NETWORK_DETAIL,
  metadataEntries: [
    metadataEntry('probes', HOSTILE_PRETTY_JSON),
    ...Array.from({ length: METADATA_ENTRY_COUNT }, (_unused, index) =>
      metadataEntry(`attempt.${index}.requestUrl`, LONG_URL),
    ),
  ],
};

/** Ordinary chrome around the same unbroken JSON body; see `ORDINARY_NETWORK_DETAIL`. */
export const ORDINARY_TRANSACTION_DETAIL: TransactionDetailViewModel = {
  ...HOSTILE_TRANSACTION_DETAIL,
  route: '/api/jdownloader/packages',
  responseHeaders: [
    { label: 'content-type', value: 'application/json' },
    { label: 'x-request-id', value: 'c-4821' },
  ],
};
