import type { NetworkDetailViewModel } from '../../src/features/network/ui/NetworkPanel/network-panel.types';
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

/** How many sibling events the Trace tab is measured with; the report showed 14+. */
const TRACE_ENTRY_COUNT = 40;

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
  metadataEntries: [
    ['requestUrl', LONG_URL],
    ['sessionToken', UNBREAKABLE_TOKEN],
  ],
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
