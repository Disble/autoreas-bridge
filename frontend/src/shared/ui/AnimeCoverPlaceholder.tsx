import type { SVGProps } from 'react';

/**
 * Cute chibi cat-girl placeholder shown when an anime has no cover art or the
 * cover fails to load (Anime Detail spec, "Placeholder on missing or failing
 * cover"). Pure inline SVG line art on `currentColor` so it follows the
 * theme in both light and dark; no external asset, no network. Shared by
 * Anime Detail and Episodes (episodes-schedule-ui spec, "A single shared
 * cover placeholder is used by both Anime Detail and Episodes").
 */
export function AnimeCoverPlaceholder(props: Readonly<SVGProps<SVGSVGElement>>) {
  return (
    <svg
      aria-label="No cover art"
      fill="none"
      role="img"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2.5"
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      {/* cat ears */}
      <path d="M26 34 L20 14 L38 24" fill="currentColor" fillOpacity="0.08" />
      <path d="M70 34 L76 14 L58 24" fill="currentColor" fillOpacity="0.08" />
      <path d="M25 27 L23 19 L31 23" strokeWidth="1.5" opacity="0.55" />
      <path d="M71 27 L73 19 L65 23" strokeWidth="1.5" opacity="0.55" />
      {/* face */}
      <circle cx="48" cy="52" r="30" fill="currentColor" fillOpacity="0.05" />
      {/* hair fringe */}
      <path d="M20 46 Q26 30 41 26 Q38 33 42 37 Q46 28 58 27 Q56 33 60 36 Q68 33 76 46" fill="currentColor" fillOpacity="0.1" />
      {/* happy closed eyes */}
      <path d="M33 56 Q38 50 43 56" />
      <path d="M53 56 Q58 50 63 56" />
      {/* cat mouth */}
      <path d="M44 66 Q48 70 52 66" strokeWidth="2" />
      {/* blush */}
      <ellipse cx="30" cy="63" fill="currentColor" fillOpacity="0.14" rx="4.5" ry="2.5" stroke="none" />
      <ellipse cx="66" cy="63" fill="currentColor" fillOpacity="0.14" rx="4.5" ry="2.5" stroke="none" />
      {/* sparkle */}
      <path d="M82 44 L83.5 48 L87.5 49.5 L83.5 51 L82 55 L80.5 51 L76.5 49.5 L80.5 48 Z" fill="currentColor" fillOpacity="0.35" stroke="none" />
    </svg>
  );
}
