import type { CoverPlaceholderSceneProps } from './CoverPlaceholderScene.types';

/**
 * Full-bleed night-scene illustration used as the default anime cover:
 * a suspension bridge over calm water under a moonlit sky (the app's own
 * identity, answering Legacy's `before_dawn.svg`). Scales to fill its slot
 * regardless of aspect ratio via `preserveAspectRatio="slice"`.
 */
export function CoverPlaceholderScene({ className }: Readonly<CoverPlaceholderSceneProps>) {
  return (
    <svg aria-label="No cover art" className={className} preserveAspectRatio="xMidYMid slice" role="img" viewBox="0 0 96 128" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="cover-scene-sky" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0b1226" />
          <stop offset="0.72" stopColor="#132040" />
          <stop offset="1" stopColor="#0e1830" />
        </linearGradient>
        <linearGradient id="cover-scene-water" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0d1a33" />
          <stop offset="1" stopColor="#070d1c" />
        </linearGradient>
      </defs>
      <rect fill="url(#cover-scene-sky)" height="94" width="96" y="0" />
      <rect fill="url(#cover-scene-water)" height="34" width="96" y="94" />
      <circle cx="71" cy="25" fill="#f6edd9" opacity="0.14" r="14" />
      <circle cx="71" cy="25" fill="#f6edd9" r="8" />
      <g fill="#e8ecf8">
        <circle cx="12" cy="14" opacity="0.85" r="1" />
        <circle cx="30" cy="30" opacity="0.5" r="0.8" />
        <circle cx="48" cy="12" opacity="0.7" r="0.9" />
        <circle cx="86" cy="48" opacity="0.45" r="0.8" />
        <circle cx="22" cy="52" opacity="0.6" r="0.7" />
        <circle cx="60" cy="42" opacity="0.35" r="0.7" />
      </g>
      <g stroke="#05070f" strokeLinecap="round">
        <path d="M-4 84 Q24 62 48 84 Q72 62 100 84" fill="none" strokeWidth="2" />
        <line strokeWidth="2.5" x1="20" x2="20" y1="60" y2="94" />
        <line strokeWidth="2.5" x1="76" x2="76" y1="60" y2="94" />
        <g strokeWidth="0.8">
          <line x1="8" x2="8" y1="78" y2="90" />
          <line x1="34" x2="34" y1="76" y2="90" />
          <line x1="48" x2="48" y1="84" y2="90" />
          <line x1="62" x2="62" y1="76" y2="90" />
          <line x1="88" x2="88" y1="78" y2="90" />
        </g>
      </g>
      <rect fill="#05070f" height="4" width="96" y="90" />
      <g stroke="#4e7fbf" strokeLinecap="round" strokeWidth="1">
        <line opacity="0.35" x1="12" x2="24" y1="103" y2="103" />
        <line opacity="0.25" x1="42" x2="58" y1="110" y2="110" />
        <line opacity="0.3" x1="70" x2="84" y1="100" y2="100" />
        <line opacity="0.2" x1="24" x2="36" y1="118" y2="118" />
      </g>
      <g stroke="#f6edd9" strokeLinecap="round" strokeWidth="1">
        <line opacity="0.3" x1="66" x2="76" y1="98" y2="98" />
        <line opacity="0.18" x1="68" x2="74" y1="104" y2="104" />
      </g>
    </svg>
  );
}
