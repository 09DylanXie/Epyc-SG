import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 18, p: P) => ({ width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true, ...p });

export const Play = ({ size, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11.3-6.8a1 1 0 0 0 0-1.72L9.5 4.34A1 1 0 0 0 8 5.2z" />
  </svg>
);
export const Pause = ({ size, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <rect x="6" y="4.5" width="4.4" height="15" rx="1.2" />
    <rect x="13.6" y="4.5" width="4.4" height="15" rx="1.2" />
  </svg>
);
export const Prev = ({ size, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <path d="M18.5 5.6v12.8a.8.8 0 0 1-1.24.67L8 13v5.2a1 1 0 0 1-2 0V5.8a1 1 0 0 1 2 0V11l9.26-6.07a.8.8 0 0 1 1.24.67z" />
  </svg>
);
export const Next = ({ size, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <path d="M5.5 5.6v12.8a.8.8 0 0 0 1.24.67L16 13v5.2a1 1 0 0 0 2 0V5.8a1 1 0 0 0-2 0V11L6.74 4.93a.8.8 0 0 0-1.24.67z" />
  </svg>
);
export const Loop = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M17 2.5l3.5 3.5L17 9.5" />
    <path d="M3.5 11.5V10a4 4 0 0 1 4-4h13" />
    <path d="M7 21.5L3.5 18 7 14.5" />
    <path d="M20.5 12.5V14a4 4 0 0 1-4 4h-13" />
  </svg>
);
export const Volume = ({ size, level = 1, ...p }: P & { level?: number }) => (
  <svg {...base(size, p)}>
    <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" fill="currentColor" stroke="none" />
    {level > 0.02 && <path d="M15.5 9a4.2 4.2 0 0 1 0 6" />}
    {level > 0.5 && <path d="M18.3 6.3a8 8 0 0 1 0 11.4" />}
    {level <= 0.02 && <path d="M16 9.5l5 5m0-5l-5 5" />}
  </svg>
);
export const Download = ({ size, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.2}>
    <path d="M12 3.5v11.5" />
    <path d="M7 10.5l5 5 5-5" />
    <path d="M4.5 20h15" />
  </svg>
);
export const Spark = ({ size, ...p }: P) => (
  <svg {...base(size, p)} fill="currentColor" stroke="none">
    <path d="M12 2.5l1.9 5.6a3 3 0 0 0 1.9 1.9l5.7 2-5.7 1.9a3 3 0 0 0-1.9 1.9L12 21.5l-1.9-5.7a3 3 0 0 0-1.9-1.9l-5.7-1.9 5.7-2a3 3 0 0 0 1.9-1.9L12 2.5z" />
  </svg>
);
export const Undo = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9 7L4.5 11.5 9 16" />
    <path d="M4.5 11.5h10a4.5 4.5 0 0 1 0 9H12" />
  </svg>
);
export const Close = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const Lock = ({ size, open, ...p }: P & { open?: boolean }) => (
  <svg {...base(size, p)}>
    <rect x="5" y="10.5" width="14" height="10" rx="2.5" />
    <path d={open ? 'M8.5 10.5V7.5a3.5 3.5 0 0 1 6.6-1.6' : 'M8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3'} />
  </svg>
);
export const Film = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
  </svg>
);
export const Shrink = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M9 4v3.5A1.5 1.5 0 0 1 7.5 9H4M20 9h-3.5A1.5 1.5 0 0 1 15 7.5V4M15 20v-3.5a1.5 1.5 0 0 1 1.5-1.5H20M4 15h3.5A1.5 1.5 0 0 1 9 16.5V20" />
  </svg>
);
export const Dice = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <rect x="4" y="4" width="16" height="16" rx="4" />
    <circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="15" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="9" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="9" cy="15" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);
export const Check = ({ size, ...p }: P) => (
  <svg {...base(size, p)} strokeWidth={2.6}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const Trash = ({ size, ...p }: P) => (
  <svg {...base(size, p)}>
    <path d="M4.5 7h15M9.5 7V4.8a.8.8 0 0 1 .8-.8h3.4a.8.8 0 0 1 .8.8V7M7 7l.8 11.6a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
  </svg>
);

/** the mark: an eclipse */
export const Mark = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <defs>
      <radialGradient id="mk" cx="50%" cy="50%" r="50%">
        <stop offset="58%" stopColor="var(--a1)" stopOpacity="0.95" />
        <stop offset="100%" stopColor="var(--a2)" stopOpacity="0" />
      </radialGradient>
    </defs>
    <circle cx="16" cy="16" r="16" fill="url(#mk)" />
    <circle cx="16" cy="16" r="9.4" fill="#050508" stroke="#fff" strokeOpacity="0.85" strokeWidth="0.9" />
  </svg>
);
