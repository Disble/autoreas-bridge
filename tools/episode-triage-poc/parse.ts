/** PROTOTYPE — disposable, NOT PRODUCTION. Conservative filename label grammar. */
export type ClaimKind =
  | "ordinal"
  | "fractional"
  | "range"
  | "multi"
  | "special"
  | "total-hint"
  | "noise"
  | "opaque";

export interface TagClaim {
  readonly raw: string;
  readonly kind: ClaimKind;
  readonly episodes?: readonly number[];
  readonly note: string;
}

export interface LabelParse {
  readonly stem: string;
  readonly claims: readonly TagClaim[];
}

/** Video extensions accepted by the read-only collector. */
export const VIDEO_EXTS = new Set([
  ".mp4",
  ".mkv",
  ".avi",
  ".webm",
  ".m4v",
  ".mov",
  ".ts",
  ".m2ts",
]);

const RESOLUTIONS = new Set(["360", "480", "576", "720", "1080", "2160", "4320"]);
const CODEC_PREFIX = /^(h|x|avc|hevc|av1)/i;

/**
 * Parse a basename into conservative claims.
 * Never requires title-stem equality; never truncates fractional/range/multi/special.
 */
export function parseLabel(basename: string): LabelParse {
  const dot = basename.lastIndexOf(".");
  const stem = dot >= 0 ? basename.slice(0, dot) : basename;
  const claims: TagClaim[] = [];
  const s = stem;

  // Special tokens (OVA/SP/etc.), optionally numbered. Never ordinal.
  const special = s.match(
    /\b(ova|oad|oav|sp|special|extra|bonus|pv|cm|ncop|nced|preview|trailer|menu|interview)(?=\d|\b)\.?\s*(\d{1,3})?/i,
  );
  if (special) {
    claims.push({
      raw: special[0],
      kind: "special",
      note: `special token "${special[1]}" is not an ordinary episode ordinal`,
    });
  }

  const spans: Array<{ start: number; end: number }> = [];
  // Fractional N.M (e.g. 10.5): ambiguous marker, never truncated to int.
  const frac = s.match(/(\d{1,3})\s*\.\s*(\d{1,3})/);
  if (frac && !looksLikeVersionPrefix(s, frac.index ?? 0)) {
    if (frac.index !== undefined) spans.push({ start: frac.index, end: frac.index + frac[0].length });
    claims.push({
      raw: frac[0],
      kind: "fractional",
      episodes: [Number(frac[1])],
      note: `fractional marker ${frac[0]} is not collapsible to ordinal ${frac[1]}`,
    });
  }

  // Delimited spans (fractional/range/multi) must start on a delimiter so a
  // season digit never becomes a range bound (slime-s4-01 is NOT range 4-01).
  const delimited = (m: RegExpMatchArray | null): boolean => {
    if (!m || m.index === undefined) return false;
    if (m.index > 0 && !/[\s_\-.[\]()【】「」]/.test(s[m.index - 1])) return false;
    spans.push({ start: m.index, end: m.index + m[0].length });
    return true;
  };

  // Range N-M / N~M (e.g. 07-08).
  const range = s.match(/(\d{1,3})\s*[-–—~～]\s*(\d{1,3})/);
  if (delimited(range) && range) {
    claims.push({
      raw: range[0],
      kind: "range",
      episodes: [Number(range[1]), Number(range[2])],
      note: `range marker covers ${range[1]}..${range[2]}, not a single trailing integer`,
    });
  }

  // Multi N+M / N&M / N,M (e.g. 10+11, 01&02).
  const multi = s.match(/(\d{1,3})\s*[+&＋＆,、/]\s*(\d{1,3})/);
  if (delimited(multi) && multi) {
    claims.push({
      raw: multi[0],
      kind: "multi",
      episodes: [Number(multi[1]), Number(multi[2])],
      note: `multi marker covers ${multi[1]}+${multi[2]}, not a single trailing integer`,
    });
  }

  // Trailing (TOTAL) hint, e.g. 01(24): dual interpretation, kept ambiguous.
  const paren = s.match(/\(\s*(\d{1,3})\s*\)\s*$/);
  if (paren) {
    claims.push({
      raw: paren[0],
      kind: "total-hint",
      episodes: [Number(paren[1])],
      note: `parenthesized (${paren[1]}) is a total/count hint, not proof of ordinal ${paren[1]}`,
    });
  }

  // Trailing ordinal candidate after a delimiter or episode keyword.
  const tail = s.match(
    /(?:^|[\s_\-\.\[\]\(\)【】「】ep]+)(?:ep|episode|e|第)?\s*(\d{1,4})\s*(?:話|话|回|集|v\d+)?\s*$/i,
  );
  // Anywhere-noise scan: years, resolutions, versions, codecs are visible
  // noise claims wherever they appear, never ordinals.
  const noiseAnywhere: Array<{ rx: RegExp; label: string }> = [
    { rx: /\b(19\d{2}|20\d{2}|2100)\b/, label: "year" },
    { rx: /\b(360|480|576|720|1080|2160|4320)p?\b/i, label: "resolution" },
    { rx: /\bv\d+\b/i, label: "version" },
    { rx: /\b(h26[45]|x26[45]|avc|hevc|av1)\b/i, label: "codec" },
  ];
  for (const n of noiseAnywhere) {
    const m = s.match(n.rx);
    if (m) {
      claims.push({ raw: m[0], kind: "noise", note: `${n.label} token ${m[0]} is not an episode ordinal` });
    }
  }

  if (tail) {
    const raw = tail[1];
    const start = (tail.index ?? 0) + tail[0].lastIndexOf(raw);
    // A trailing number inside a fractional/range/multi span is part of that
    // marker, never a standalone ordinal (10.5 does not yield ordinal 5).
    const insideSpan = spans.some((sp) => start >= sp.start && start < sp.end);
    const why = insideSpan ? `trailing ${raw} belongs to a fractional/range/multi marker` : noiseReason(s, raw, start);
    if (why) {
      claims.push({ raw, kind: "noise", note: why });
    } else {
      const n = Number(raw);
      const keyword = /(ep|episode|第|話|话)/i.test(tail[0]);
      claims.push({
        raw: tail[0].trim(),
        kind: "ordinal",
        episodes: [n],
        note: keyword
          ? `explicit episode keyword yields ordinal candidate ${n}`
          : `delimited trailing token yields ordinal candidate ${n}`,
      });
    }
  }

  // Bare S01E13 style anywhere (episode keyword wins over noise rules).
  const sxxexx = s.match(/\bS\d{1,2}\s*E(\d{1,3})\b/i);
  if (sxxexx) {
    claims.push({
      raw: sxxexx[0],
      kind: "ordinal",
      episodes: [Number(sxxexx[1])],
      note: `SxxEyy marker yields ordinal candidate ${sxxexx[1]}`,
    });
  }
  const cn = s.match(/第\s*(\d{1,3})\s*[話话回集]/);
  if (cn) {
    claims.push({
      raw: cn[0],
      kind: "ordinal",
      episodes: [Number(cn[1])],
      note: `CJK episode marker yields ordinal candidate ${cn[1]}`,
    });
  }

  if (claims.length === 0) {
    claims.push({ raw: s, kind: "opaque", note: "no delimited numeric candidate; opaque label" });
  }
  return { stem: s, claims };
}

/** Ordinal candidates only (kind === ordinal). */
export function ordinalCandidates(p: LabelParse): number[] {
  const out: number[] = [];
  for (const c of p.claims) {
    if (c.kind === "ordinal" && c.episodes) out.push(...c.episodes);
  }
  return [...new Set(out)];
}

/** True when the label carries any non-plain-ordinal marker. */
export function hasAmbiguousMarker(p: LabelParse): boolean {
  return p.claims.some((c) =>
    c.kind === "fractional" || c.kind === "range" || c.kind === "multi" || c.kind === "total-hint" ||
    c.kind === "special",
  );
}

function looksLikeVersionPrefix(s: string, idx: number): boolean {
  const before = s.slice(Math.max(0, idx - 4), idx).toLowerCase();
  return before.endsWith(" v") || before.endsWith("ver") || /v$/i.test(before.trim());
}

function noiseReason(s: string, raw: string, start: number): string | null {
  if (/^\d{4}$/.test(raw)) {
    const y = Number(raw);
    if (y >= 1900 && y <= 2100) return `4-digit year ${raw} is not an episode ordinal`;
  }
  if (RESOLUTIONS.has(raw)) return `resolution token ${raw} is not an episode ordinal`;
  const before = s.slice(Math.max(0, start - 3), start).toLowerCase();
  if (CODEC_PREFIX.test(before + raw.slice(0, 1)) && /h|x/i.test(before)) {
    return `codec token near "${raw}" is not an episode ordinal`;
  }
  if (/v$/i.test(before.trim())) return `version token v${raw} is not an episode ordinal`;
  return null;
}
