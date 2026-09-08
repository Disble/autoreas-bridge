import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** Resolves this script's directory for stable package-local asset paths. */
const scriptsDirectory = path.dirname(fileURLToPath(import.meta.url));
/** Lists the complete production artwork set this check enforces. */
const assetNames = ['today.webp', 'editor-library.webp', 'catalog.webp'];
/** Holds the exact dimensions every empty-state asset must expose. */
const assetDimension = 512;

/**
 * Runs a binary without a shell so asset paths remain data rather than executable input.
 * @param {string} command Executable to invoke.
 * @param {readonly string[]} arguments_ Arguments passed to the executable.
 * @returns {{ readonly status: number | null; readonly stdout: Buffer; readonly stderr: Buffer }} Process output.
 */
function run(command, arguments_) {
  const result = spawnSync(command, arguments_, { encoding: null });
  return { status: result.status, stdout: result.stdout ?? Buffer.alloc(0), stderr: result.stderr ?? Buffer.alloc(0) };
}

/**
 * Reads codec and dimensions from ffprobe's JSON output.
 * @param {string} assetPath Asset file to inspect.
 * @returns {{ readonly codec: string; readonly width: number; readonly height: number } | undefined} Decoded stream metadata.
 */
function inspectStream(assetPath) {
  const result = run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height', '-of', 'json', assetPath]);
  if (result.status !== 0) {
    return undefined;
  }
  const stream = JSON.parse(result.stdout.toString()).streams?.[0];
  if (stream === undefined) {
    return undefined;
  }
  return { codec: stream.codec_name, width: stream.width, height: stream.height };
}

/**
 * Decodes the alpha plane, allowing validation to reject alpha-capable images whose pixels are all opaque.
 * @param {string} assetPath Asset file to inspect.
 * @returns {Buffer | undefined} Raw alpha bytes, or undefined when decoding fails.
 */
function decodeAlpha(assetPath) {
  const result = run('ffmpeg', ['-v', 'error', '-i', assetPath, '-vf', 'alphaextract', '-f', 'rawvideo', '-']);
  return result.status === 0 ? result.stdout : undefined;
}

/**
 * Validates the decoded facts that define a shippable Airis asset.
 * @param {string} assetName File name used in diagnostics.
 * @param {{ readonly codec: string; readonly width: number; readonly height: number; readonly alphaBytes: Buffer }} details Decoded facts.
 * @returns {string[]} Validation failures; empty means the asset meets the contract.
 */
export function validateAssetDetails(assetName, details) {
  for (const check of assetChecks) {
    const failure = check(assetName, details);
    if (failure !== undefined) {
      return [failure];
    }
  }
  return [];
}

/**
 * Rejects a container the app's Vite import would not treat as the WebP it expects.
 * @param {string} assetName File name used in diagnostics.
 * @param {{ readonly codec: string }} details Decoded facts.
 * @returns {string | undefined} The failure, or undefined when the codec is right.
 */
function checkCodec(assetName, details) {
  return details.codec === 'webp' ? undefined : `${assetName}: expected codec webp, got ${details.codec}`;
}

/**
 * Rejects artwork that is not the exact square the shared shell renders at.
 * @param {string} assetName File name used in diagnostics.
 * @param {{ readonly width: number; readonly height: number }} details Decoded facts.
 * @returns {string | undefined} The failure, or undefined when both edges match.
 */
function checkDimensions(assetName, details) {
  const isExact = details.width === assetDimension && details.height === assetDimension;
  return isExact ? undefined : `${assetName}: expected ${assetDimension}x${assetDimension}, got ${details.width}x${details.height}`;
}

/**
 * Rejects an alpha-capable asset whose every pixel is opaque, which is what a
 * composition exported over a background looks like from the outside.
 * @param {string} assetName File name used in diagnostics.
 * @param {{ readonly alphaBytes: Buffer }} details Decoded facts.
 * @returns {string | undefined} The failure, or undefined when any pixel is transparent.
 */
function checkTransparency(assetName, details) {
  return details.alphaBytes.some((byte) => byte < 255) ? undefined : `${assetName}: expected at least one transparent pixel`;
}

/** The decoded-facts contract, in the order a failure is most useful to read. */
const assetChecks = [checkCodec, checkDimensions, checkTransparency];

/**
 * Inspects one asset through ffprobe and ffmpeg before applying the shared decoded-facts contract.
 * @param {string} assetPath Absolute asset path.
 * @returns {string[]} Validation failures; empty means the asset meets the contract.
 */
export function validateAirisAsset(assetPath) {
  const metadata = inspectStream(assetPath);
  const alphaBytes = decodeAlpha(assetPath);
  if (metadata === undefined || alphaBytes === undefined) {
    return [`${path.basename(assetPath)}: could not decode WebP metadata or alpha`];
  }
  return validateAssetDetails(path.basename(assetPath), { ...metadata, alphaBytes });
}

/** Runs the asset check only when this module is executed as the package script. */
function main() {
  const assetsDirectory = path.resolve(scriptsDirectory, '..', 'src', 'assets', 'airis-empty-states');
  const failures = assetNames.flatMap((assetName) => validateAirisAsset(path.join(assetsDirectory, assetName)));
  if (failures.length > 0) {
    console.error(failures.join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log(`Validated ${assetNames.length} transparent 512x512 WebP Airis assets.`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
