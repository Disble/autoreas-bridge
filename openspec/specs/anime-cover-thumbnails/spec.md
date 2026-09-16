# Anime Cover Thumbnails Specification

## Purpose

Define the fixed, versioned shape of a generated anime cover thumbnail, how a source is
identified for caching, how the derived cache behaves, how concurrent generation is bounded,
and how the desktop UI binding consumes a thumbnail instead of an original image.

## Requirements

### Requirement: Thumbnail Spec v1

The system MUST generate every thumbnail according to the following fixed rules. Any rule
change below MUST bump the spec version (see the versioning requirement).

| Aspect | Rule |
|---|---|
| Size | Fit to 320 px height, scale width to preserve aspect ratio, never upscale |
| Pass-through | An already-JPEG source no taller than 320 px is served byte-for-byte |
| Pixel cap | A source whose declared width times height exceeds 16,777,216 is invalid, rejected before a full decode |
| Formats | Decodes JPEG, PNG, GIF (first frame only), and WebP; anything else is invalid |
| Alpha | Transparent pixels flatten onto opaque `#1B2636` unless the caller supplies another color |
| Encoding | Generated (non-pass-through) output is JPEG at quality 80 |
| ETag | A double-quoted SHA-256 hex digest of the exact served bytes, computed once at generation |

#### Scenario: A tall source is downscaled without distortion

- GIVEN a decodable source 900 px tall and 600 px wide
- WHEN thumbnail generation runs
- THEN the produced thumbnail is exactly 320 px tall and 213 px wide

#### Scenario: A short source is never upscaled

- GIVEN a decodable source 200 px tall
- WHEN thumbnail generation runs
- THEN the produced thumbnail remains 200 px tall

#### Scenario: An already-small JPEG passes through unmodified

- GIVEN a JPEG source 180 px tall
- WHEN thumbnail generation runs
- THEN the served bytes are byte-identical to the source bytes

#### Scenario: A source over the pixel cap is rejected before decoding

- GIVEN a source declaring dimensions whose product exceeds 16,777,216 pixels
- WHEN thumbnail generation evaluates the source
- THEN it is classified invalid
- AND no full decode of the source is attempted

#### Scenario: An animated GIF renders only its first frame

- GIVEN a multi-frame animated GIF source
- WHEN thumbnail generation runs
- THEN the produced thumbnail contains only the first frame's pixels

#### Scenario: A transparent source flattens onto the default background

- GIVEN a PNG source with a fully transparent pixel
- WHEN thumbnail generation runs with no caller-supplied background
- THEN that pixel is encoded as opaque `#1B2636`, not black or transparent

### Requirement: A Spec Version Change Invalidates Every Cached Thumbnail

The system MUST key cached thumbnails by the spec version in effect when they were generated,
and MUST NOT serve a thumbnail generated under a prior spec version once the version changes.

#### Scenario: Bumping the spec version yields a freshly generated thumbnail

- GIVEN a cached thumbnail generated under spec version 1
- WHEN the spec version becomes 2 and the same source is requested again
- THEN a newly generated thumbnail with a different ETag is served
- AND the version-1 cached bytes are not reused

### Requirement: Source Identity Detects Content Changes Without Rereading Every Byte

The system MUST identify a local-file source by its path, size, and modification time, and
MUST identify a URL source by the SHA-256 of the fetched origin bytes, computed once when the
origin is fetched and reused on later requests.

#### Scenario: Replacing a local file at the same path invalidates its cached thumbnail

- GIVEN a cached thumbnail for a local file at a given path
- WHEN a different image is written to that same path, changing its size or modification time
- THEN the next request for that path serves a newly generated thumbnail with a different ETag
- AND the stale cached thumbnail is not served

### Requirement: A Deleted Local Source Falls Back To Its Last Good Copy

The system MUST keep a best-effort last-good copy of a local-file source's bytes and the
identity recorded when they were copied. WHEN a local source's original file is gone (not
merely unreadable), the system MUST serve that copy under its originally recorded identity
instead of treating the source as permanently absent, and MUST NOT fall back for any other
local read failure. A copy write failure MUST NOT fail or delay the source it rides along with,
and MUST NOT rewrite the copy when the source's identity is unchanged since the last write.

#### Scenario: A deleted local file still serves its last good copy

- GIVEN a local cover that loaded successfully at least once
- WHEN its file is later deleted and the same cover is requested again
- THEN the response serves the previously loaded bytes
- AND the served identity (and therefore the derived thumbnail's ETag) matches what it was
  before the file was deleted

#### Scenario: A local file that never loaded successfully still answers absent

- GIVEN a local cover path with no last-good copy on record
- WHEN its file does not exist
- THEN the source is classified permanently gone, exactly as before this requirement existed

#### Scenario: A transient local read failure never falls back to a stale copy

- GIVEN a local cover with a last-good copy on record
- WHEN the current read fails for a reason other than the file not existing
- THEN the result is classified transient
- AND the last-good copy is not served

#### Scenario: Replacing the local file in place updates the last-good copy

- GIVEN a local cover with a last-good copy on record
- WHEN a different image is successfully loaded from the same path, changing its size or
  modification time
- THEN the last-good copy is updated to the new bytes and identity
- AND a later deletion falls back to the new copy, not the stale one

### Requirement: Cached Thumbnails Are Written Once, Safely Under Concurrent Writers

The system MUST publish a new cache entry through a uniquely named temporary file before it
becomes visible under its final name, and MUST treat a failed publish whose final name already
exists as success rather than as an error.

#### Scenario: Two concurrent generations of the same key both succeed

- GIVEN two concurrent requests that both generate the same not-yet-cached thumbnail
- WHEN both attempt to publish their result under the same final name
- THEN both requests complete successfully
- AND both serve identical bytes

### Requirement: Thumbnail Generation Is Bounded To Two Concurrent Slots

The system MUST allow at most 2 concurrent decode/resize/encode operations. A caller acquiring
a slot on behalf of an HTTP request MUST wait only a bounded time and then receive a transient
(saturated) outcome if no slot freed. The desktop UI binding MUST instead wait for a slot
without failing fast.

#### Scenario: HTTP acquisition fails fast under saturation

- GIVEN both slots are occupied for longer than the bounded wait
- WHEN an HTTP request needs a thumbnail
- THEN it receives a transient, saturated outcome instead of waiting indefinitely

#### Scenario: The desktop binding waits rather than failing fast

- GIVEN both slots are occupied
- WHEN the desktop UI binding requests a thumbnail
- THEN it waits for a slot to free rather than returning a failure

### Requirement: The Desktop Binding Serves The Thumbnail, Not The Original

`GetAnimeCover` MUST return the generated or pass-through thumbnail as a
`data:image/jpeg;base64,` data URL and MUST NOT return the original source bytes. Its existing
response shape and failure fallback to the placeholder are unchanged.

#### Scenario: The binding returns a thumbnail-sized data URL, not the original

- GIVEN an anime whose stored local cover is 900 px tall
- WHEN `GetAnimeCover` is called for it
- THEN the resolved `dataUrl` decodes to an image no taller than 320 px
