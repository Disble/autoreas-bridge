import type { BrandMarkProps } from './BrandMark.types';

/**
 * The Autoreas Bridge logo mark: the stylised "A" from the application icon.
 *
 * Traced from `build/appicon.png`, the single master every app icon derives
 * from, so the mark in the UI and the icon in the taskbar can never drift.
 * `fill-rule="evenodd"` is load-bearing -- it is what keeps the counter of the
 * A open instead of filling it into a solid wedge.
 *
 * The mark carries no colour of its own: `currentColor` lets each slot set it
 * (white on the navigation rail, brand blue on light chrome). It is decorative
 * everywhere it is used today, since every slot already names the app in text
 * beside it, so it stays `aria-hidden` and the surrounding label does the work.
 */
export function BrandMark({ className }: Readonly<BrandMarkProps>) {
  return (
    <svg aria-hidden="true" className={className} fill="currentColor" viewBox="0 0 673.91 764.07" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M673.91 702.29c-43.31-58.97-85.14-117.8-122.16-181-65.72-112.23-116.29-232.37-163.86-353.16-17.65-44.81-33.92-90.16-51.89-134.84-5-12.43-15.25-25.75-28.11-30.86-17.11-6.81-16.7 1.18-23.32 17.86-1.8 4.52-3.41 9.18-4.09 14-3.13 22.16 4.74 44.37 2.53 67-5.73 58.57-26.1 119.34-44.12 173.9-11.08 33.56-23.38 66.73-36 99.74-30.54 79.89-69.02 157.22-111.55 231.36-27.93 48.69-57.15 96.63-85.63 145-2.21 3.75-7.45 8.32-5.13 12 1.59 2.51 5.12-1.86 5.31-2.11 9.78-12.81 19.51-25.66 28.7-38.89 23.89-34.41 47.66-68.91 70.53-104 16.91-25.95 33.08-52.38 48.77-79.07 4.47-7.61 39.88-90.91 70-110.28 2.62-1.68 6.15-1.28 9-2.55 9.86-4.37 19.03-10.21 29-14.32 15.76-6.5 27.62-9.06 44-10.89 10.37-1.16 21.77-.97 32 .81 27.31 4.77 60.93 13.09 81 32.87 17.55 17.3 27.96 43.98 39.82 63.43 10.15 16.63 20.72 33.03 31.88 49 23.94 34.24 52.5 66.84 84.3 94 34.29 29.29 49.83 38.19 90 61.21 5.81 3.33 5.1 2.61 9.02-.21M316.89 171.8c-19.61 39.47 7.64-16.46-33.6 100.49-10.34 29.33-27.09 56.61-33.73 87-1.06 4.81 8.71 4.64 13.33 6.35 5.53 2.04 11.25 3.56 17 4.87 25.88 5.86 51.14 6.47 77-.04 8.48-2.14 16.75-5.02 25-7.9 2.05-.71 5.69-2.25 4.92-4.28-76.66-201.65 7.48 31.45-69.92-186.49"
        fillRule="evenodd"
      />
    </svg>
  );
}
