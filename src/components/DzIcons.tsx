// The design's line icons (FIXED2, 7 Oct): 1.7 px stroke, round caps, drawn
// on a 24 grid. One component, so every screen draws the same shapes.

export type DzIconName =
  | "flag" | "link" | "target" | "search" | "user" | "plus" | "mic" | "send" | "up"
  | "down" | "right" | "back" | "x" | "panel" | "bell" | "check" | "people" | "spark" | "hourglass" | "pulse";

const PATHS: Record<DzIconName, React.ReactNode> = {
  flag: <><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r=".6" fill="currentColor" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0" /><path d="M12 17.5V21" /></>,
  send: <><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4 18-7Z" /></>,
  up: <><path d="M12 19V5" /><path d="m6 11 6-6 6 6" /></>,
  back: <><path d="M19 12H5" /><path d="m11 6-6 6 6 6" /></>,
  x: <><path d="M6 6l12 12" /><path d="M18 6 6 18" /></>,
  panel: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5" /><path d="M14.5 4.5v15" /></>,
  down: <path d="m6 9 6 6 6-6" />,
  right: <path d="m9 6 6 6-6 6" />,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15L6 16Z" /><path d="M10 20.5a2 2 0 0 0 4 0" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8" /><path d="M18 14.4a6.5 6.5 0 0 1 3.5 5.6" /></>,
  spark: <><path d="M12 3v4M12 17v4M3 12h4M17 12h4" /><path d="m6.3 6.3 2.1 2.1M15.6 15.6l2.1 2.1M6.3 17.7l2.1-2.1M15.6 8.4l2.1-2.1" /></>,
  hourglass: <><path d="M7 3h10M7 21h10" /><path d="M8 3c0 5 8 5 8 9s-8 4-8 9" /><path d="M16 3c0 5-8 5-8 9s8 4 8 9" /></>,
  pulse: <path d="M3 12h4l2-5 4 10 2-5h6" />,
};

export default function DzIcon({ name, size = 18, className, style }: { name: DzIconName; size?: number; className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      {PATHS[name]}
    </svg>
  );
}

export const ROLE_ICON: Record<"initiator" | "mediator" | "addressee", DzIconName> = {
  initiator: "flag",
  mediator: "link",
  addressee: "target",
};
