import type { JSX } from "react";

const P: Record<string, JSX.Element> = {
  back: <path d="M15.6 4.8C10.4 8 8.2 10.4 7 12c1.3 1.7 3.8 4.3 8.5 7.2" />,
  forward: <path d="M8.4 4.8C13.6 8 15.8 10.4 17 12c-1.3 1.7-3.8 4.3-8.5 7.2" />,
  reload: (<><path d="M19.2 12a7.2 7.2 0 1 1-2.3-5.3" /><path d="M19.6 4.2v4.2h-4.2" /></>),
  home: (<><path d="M3.8 11.4 12 4.2l8.2 7.2" /><path d="M6.3 10.3v9.2h11.4v-9.2" /></>),
  star: <path d="m12 3.9 2.5 5.2 5.6.8-4.1 4 1 5.7-5-2.8-5 2.8 1-5.7-4.1-4 5.6-.8z" />,
  shield: (<><path d="M12 3.2 5.1 5.9v5.7c0 4.3 2.9 7.4 6.9 9 4-1.6 6.9-4.7 6.9-9V5.9z" /><path d="m9 12 2.2 2.2L15.3 10" /></>),
  shieldOff: (<><path d="M12 3.2 5.1 5.9v5.7c0 4.3 2.9 7.4 6.9 9 4-1.6 6.9-4.7 6.9-9V5.9z" /><path d="m9.3 9.3 5.4 5.4M14.7 9.3l-5.4 5.4" /></>),
  spark: (<><path d="m11 3.4 1.8 4.6 4.6 1.8-4.6 1.8L11 16.2 9.2 11.6 4.6 9.8l4.6-1.8z" /><path d="m18.4 15.2.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></>),
  scissors: (<><circle cx="6.4" cy="17.6" r="2.4" /><circle cx="6.4" cy="6.4" r="2.4" /><path d="M8.5 8.1 19.6 17.2M19.6 6.8 8.5 15.9" /></>),
  close: <path d="M6.6 6.6 17.4 17.4M17.4 6.6 6.6 17.4" />,
  plus: <path d="M12 5.4v13.2M5.4 12h13.2" />,
  minus: <path d="M5.4 12h13.2" />,
  dots: (<><circle cx="12" cy="5.6" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="18.4" r="1.5" /></>),
  ghost: (<><path d="M5.4 20.2V9.7a6.6 6.6 0 0 1 13.2 0v10.5l-2.2-1.8-2.2 1.8-2.2-1.8-2.2 1.8z" /><path d="M9.6 10.1h.01M14.4 10.1h.01" strokeWidth="2.4" /></>),
  sun: (<><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.6 5.6l1.7 1.7M16.7 16.7l1.7 1.7M18.4 5.6l-1.7 1.7M7.3 16.7l-1.7 1.7" /></>),
  moon: <path d="M19.4 14.6A7.8 7.8 0 0 1 9.4 4.6a7.8 7.8 0 1 0 10 10z" />,
  pen: (<><path d="M4.2 19.8l1.1-4.2L16.4 4.5a2.1 2.1 0 0 1 3.1 3L8.4 18.7z" /><path d="m14.4 6.6 3 3" /></>),
  note: (<><path d="M4.8 4.6h14.4v9.8l-5 5.2H4.8z" /><path d="M19.2 14.4h-5v5.2" /></>),
  clock: (<><circle cx="12" cy="12" r="8.4" /><path d="M12 7.2V12l3.4 2.2" /></>),
  book: (<><path d="M4 5.2c2.8-.9 5.4-.9 8 .6v13c-2.6-1.5-5.2-1.5-8-.6z" /><path d="M20 5.2c-2.8-.9-5.4-.9-8 .6v13c2.6-1.5 5.2-1.5 8-.6z" /></>),
  gear: (<><circle cx="12" cy="12" r="3.2" /><path d="M12 3.2v2.2M12 18.6v2.2M3.2 12h2.2M18.6 12h2.2M5.8 5.8l1.6 1.6M16.6 16.6l1.6 1.6M18.2 5.8l-1.6 1.6M7.4 16.6l-1.6 1.6" /></>),
  search: (<><circle cx="10.8" cy="10.8" r="6.2" /><path d="m15.4 15.4 4.4 4.4" /></>),
  lock: (<><rect x="5.2" y="10.4" width="13.6" height="9.2" rx="2.4" /><path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" /></>),
  globe: (<><circle cx="12" cy="12" r="8.4" /><path d="M3.6 12h16.8M12 3.6c2.4 2.4 3.6 5.2 3.6 8.4s-1.2 6-3.6 8.4c-2.4-2.4-3.6-5.2-3.6-8.4S9.6 6 12 3.6z" /></>),
  trash: (<><path d="M4.8 6.6h14.4M9.6 6.6V4.4h4.8v2.2" /><path d="M6.6 6.6 7.6 20h8.8l1-13.4" /><path d="M10.2 10v6.4M13.8 10v6.4" /></>),
  download: (<><path d="M12 4v10.6M7.6 10.6 12 15l4.4-4.4" /><path d="M4.8 19.2h14.4" /></>),
  copy: (<><rect x="8.4" y="8.4" width="11.2" height="11.2" rx="2.4" /><path d="M15.6 8.4V6.2a1.8 1.8 0 0 0-1.8-1.8H6.2a1.8 1.8 0 0 0-1.8 1.8v7.6a1.8 1.8 0 0 0 1.8 1.8h2.2" /></>),
  check: <path d="m5 12.8 4.6 4.4L19 6.6" />,
  chevron: <path d="m9.4 5.8 6.2 6.2-6.2 6.2" />,
  chevronDown: <path d="m5.8 9.4 6.2 6.2 6.2-6.2" />,
  pin: (<><path d="M14.6 3.4 20.6 9.4l-3 1-1.4 4.4-5.8-5.8L14.8 7.6z" /><path d="m9.4 14.6-5.8 5.8" /></>),
  marker: (<><path d="m14.4 3.8 5.8 5.8-8.6 8.6-5.8-5.8z" /><path d="M4.4 20.2h6" /><path d="m5.8 12.4 5.8 5.8" /></>),
  eraser: (<><path d="m8.8 19.6-4.4-4.4a2 2 0 0 1 0-2.8l8-8a2 2 0 0 1 2.8 0l4.4 4.4a2 2 0 0 1 0 2.8l-8 8z" /><path d="M7.2 20.4h12.4" /></>),
  undo: (<><path d="M4.8 9.6h9.6a5.2 5.2 0 0 1 0 10.4H8.4" /><path d="m8.4 5.2-3.6 4.4 3.6 4" /></>),
  keyboard: (<><rect x="2.8" y="6.4" width="18.4" height="11.2" rx="2.4" /><path d="M6.4 10h.01M9.6 10h.01M12.8 10h.01M16 10h.01M7.6 14h8.8" strokeWidth="2" /></>),
  send: <path d="M20.4 3.6 3.6 10.2l6.6 2.6 2.6 6.6z" />,
  stop: <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="2" />,
  eye: (<><path d="M2.6 12S6 5.8 12 5.8 21.4 12 21.4 12 18 18.2 12 18.2 2.6 12 2.6 12z" /><circle cx="12" cy="12" r="2.8" /></>),
  eyeOff: (<><path d="M4.2 4.2 19.8 19.8" /><path d="M9.4 6.3A9.6 9.6 0 0 1 12 5.8c6 0 9.4 6.2 9.4 6.2a17 17 0 0 1-3.2 4M6.6 8.2A16.7 16.7 0 0 0 2.6 12S6 18.2 12 18.2a9.7 9.7 0 0 0 3.6-.7" /></>),
  external: (<><path d="M13.6 4.4h6v6" /><path d="m19.6 4.4-8.4 8.4" /><path d="M18 14v4.4a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 18.4V7.6A1.6 1.6 0 0 1 5.6 6H10" /></>),
  bulb: (<><path d="M9 17.6a6 6 0 1 1 6 0v1.6H9z" /><path d="M9.8 21.2h4.4" /></>),
  duck: (<><path d="M15.4 4.6a3.6 3.6 0 0 1 1.6 6.8c2 1.4 3 3.4 3 5.6a4.6 4.6 0 0 1-4.6 4.4H8.2A4.2 4.2 0 0 1 4 17.2c0-2.4 2-3.6 4.4-3.6h4.2" /><path d="M16.6 7.4h.01M19.6 8.2l2-.6-2-.8" strokeWidth="1.8" /></>),
  news: (<><path d="M4 6.4h13.2v13.2H4z" /><path d="M17.2 9.6H20v7.2a2.8 2.8 0 0 1-2.8 2.8" /><path d="M6.8 9.6h7.6M6.8 12.8h7.6M6.8 16h4.4" /></>),
  quill: (<><path d="M20 4c-6 .6-10.4 3.4-12.4 8.2L6 16l3.8-1.6C14.6 12.4 17.4 8 20 4z" /><path d="M4.4 20.4 9.6 15.2" /></>),
  atom: (<><circle cx="12" cy="12" r="2" /><ellipse cx="12" cy="12" rx="9" ry="4" /><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(60 12 12)" /><ellipse cx="12" cy="12" rx="9" ry="4" transform="rotate(120 12 12)" /></>),
  archive: (<><rect x="3.2" y="4.4" width="17.6" height="4" rx="1.2" /><path d="M5 8.4v10a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-10" /><path d="M10 12.4h4" /></>),
  code: <path d="m8.4 7.2-4.8 4.8 4.8 4.8M15.6 7.2l4.8 4.8-4.8 4.8M13.6 4.8l-3.2 14.4" />,
  smile: (<><circle cx="12" cy="12" r="8.4" /><path d="M8.8 14.4a4 4 0 0 0 6.4 0" /><path d="M9.2 9.6h.01M14.8 9.6h.01" strokeWidth="2.4" /></>),
  shell: (<><path d="M12 20.4a8.4 8.4 0 0 1 0-16.8c3.6 0 6 2 6 4.8 0 2.2-1.6 3.8-3.6 3.8-1.6 0-2.8-1-2.8-2.4" /><path d="M12 20.4V12M5.4 15.6l6.6-3.6M4 10.4l8 1.6M7.2 5.2 12 12" /></>),
  branch: (<><circle cx="7" cy="6" r="2.2" /><circle cx="7" cy="18" r="2.2" /><circle cx="17" cy="9" r="2.2" /><path d="M7 8.2v7.6M17 11.2c0 3-2.4 4.4-5.4 4.6" /></>),
  zap: <path d="M13.4 3.2 5.6 13.6h5.2L10 20.8l8-10.6h-5.2z" />,
  coffee: (<><path d="M4.4 8.4h13v6.4a4.4 4.4 0 0 1-4.4 4.4H8.8a4.4 4.4 0 0 1-4.4-4.4z" /><path d="M17.4 10h1.6a2.4 2.4 0 0 1 0 4.8h-1.6" /><path d="M8 3.2v2M11.4 3.2v2" /></>),
  filter: <path d="M3.6 5.6h16.8l-6.6 7.6v6l-3.6 1.8v-7.8z" />,
  layers: (<><path d="m12 3.6 8.4 4.4-8.4 4.4L3.6 8z" /><path d="m3.6 12.8 8.4 4.4 8.4-4.4" /><path d="m3.6 16.8 8.4 4.4 8.4-4.4" /></>),
  history: (<><path d="M4 12a8 8 0 1 0 2.6-5.9" /><path d="M4 4.4V9h4.6" /><path d="M12 8v4.4l3.2 2" /></>),
  palette: (<><path d="M12 3.6a8.4 8.4 0 0 0 0 16.8c1.4 0 2-.8 2-1.8s-.8-1.6-.8-2.4.6-1.4 1.6-1.4h1.6a4 4 0 0 0 4-4c0-4-3.8-7.2-8.4-7.2z" /><circle cx="8" cy="10" r="1.1" /><circle cx="12" cy="7.6" r="1.1" /><circle cx="16" cy="9.6" r="1.1" /></>),
  antenna: (<><path d="M12 12v8.4" /><path d="M8.8 20.4h6.4" /><path d="M9 9a4.2 4.2 0 0 1 6 0" /><path d="M6.4 6.2a7.8 7.8 0 0 1 11.2 0" /><circle cx="12" cy="12" r="1.4" /></>),
  split: (<><rect x="3.6" y="4.4" width="16.8" height="15.2" rx="2.4" /><path d="M12 4.4v15.2" /></>),
  flame: <path d="M12 3.2s5 4 5 8.6a5 5 0 0 1-10 0c0-1.6.8-3 .8-3S9 11 10.4 11c0-2.8 1.6-6 1.6-7.8z" />,
  heart: <path d="M12 20s-7.6-4.6-7.6-9.4A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.6 3c0 4.8-7.6 9.4-7.6 9.4z" />,
  target: (<><circle cx="12" cy="12" r="8.4" /><circle cx="12" cy="12" r="4.4" /><circle cx="12" cy="12" r="1" /></>),
  clock2: <path d="M12 6.4V12l4 2.4" />,
};

export type IconName = keyof typeof P;

export function Icon({
  name,
  size = 20,
  className = "",
  strokeWidth = 1.9,
  fill = "none",
}: {
  name: string;
  size?: number;
  className?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  const d = P[name] || P.spark;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill}
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      style={{ flex: "0 0 auto", overflow: "visible" }}
    >
      {d}
    </svg>
  );
}

/** The Quill logotype: a nib that draws itself. */
export function Logo({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none" aria-hidden="true">
      <path
        className="draw"
        style={{ ["--len" as any]: 130 }}
        d="M33 6c-11 1.2-19.5 6.6-23.5 15.6L6.6 28l6.6-2.6C22.4 21.6 28.6 13.4 33 6z"
        stroke="var(--ink)"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path d="M6 34 14 26" stroke="var(--pink)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="24.5" cy="15" r="1.8" fill="var(--yellow)" />
    </svg>
  );
}
