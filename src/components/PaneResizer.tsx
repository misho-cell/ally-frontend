"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// #829 (4 Oct). On a desktop the conversation list and the chat sat at fixed
// widths. A long goal title was cut off with no way to see it, and on a wide
// screen the chat stayed narrow while space went unused beside it.
//
// The handle is a real element rather than a CSS resizer, because it has to
// be grabbable: a one-pixel border is a one-pixel target, and the person
// reaching for it is the same person who could not read the title.
//
// Pointer events, not mouse events: the same code then works for a trackpad,
// a mouse and a stylus, and `setPointerCapture` keeps the drag alive when
// the cursor outruns the handle, which it always does.
export const SIDEBAR_MIN = 240;
export const SIDEBAR_MAX = 640;
export const SIDEBAR_KEY = "netai_sidebar_width";

export function clampSidebar(px: number): number {
  return Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)));
}

// The chosen width belongs to this browser, so it is read as an external
// store rather than as page state: the server snapshot is null, which means
// "whatever the stylesheet says", and the stored answer arrives on the next
// render instead of as a hydration mismatch. Same shape as the diagnostics
// flag, for the same reason.
let current: number | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function subscribeSidebarWidth(fn: () => void): () => void {
  if (!loaded) {
    loaded = true;
    try {
      const raw = window.localStorage.getItem(SIDEBAR_KEY);
      const n = raw ? Number(raw) : NaN;
      if (Number.isFinite(n)) current = clampSidebar(n);
    } catch {
      // Private windows and blocked storage: the default width is correct.
    }
  }
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function sidebarWidthSnapshot(): number | null {
  return current;
}

export function sidebarWidthServerSnapshot(): number | null {
  return null;
}

export function setSidebarWidth(px: number | null): void {
  if (current === px) return;
  current = px;
  try {
    if (px == null) window.localStorage.removeItem(SIDEBAR_KEY);
    else window.localStorage.setItem(SIDEBAR_KEY, String(px));
  } catch {
    // The drag still applies to this visit even when nothing is stored.
  }
  emit();
}

export default function PaneResizer({
  width,
  onChange,
  onReset,
  label,
}: {
  width: number | null;
  onChange: (px: number) => void;
  onReset: () => void;
  label: string;
}) {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startW = useRef(0);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // The width may be unset (still the stylesheet's default), so the drag
    // starts from what the pane actually measures rather than from a number
    // we have not got.
    const pane = e.currentTarget.previousElementSibling as HTMLElement | null;
    startW.current = width ?? pane?.getBoundingClientRect().width ?? SIDEBAR_MIN;
    startX.current = e.clientX;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onChange(clampSidebar(startW.current + (e.clientX - startX.current)));
  };

  const stop = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    setDragging(false);
  };

  // While dragging, the whole document stops selecting text. Without this a
  // drag across the chat highlights every message it passes over.
  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.userSelect;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = prev;
      document.body.style.cursor = "";
    };
  }, [dragging]);

  // The keyboard gets the same control, because a pointer drag is the one
  // interaction that excludes people outright rather than merely slowing
  // them down.
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 48 : 16;
      const current = width ?? SIDEBAR_MIN;
      if (e.key === "ArrowLeft") { e.preventDefault(); onChange(clampSidebar(current - step)); }
      else if (e.key === "ArrowRight") { e.preventDefault(); onChange(clampSidebar(current + step)); }
      else if (e.key === "Home") { e.preventDefault(); onReset(); }
    },
    [width, onChange, onReset]
  );

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
      onKeyDown={onKeyDown}
      onDoubleClick={onReset}
      title={label}
      className="hidden md:block shrink-0 pane-resizer"
      data-dragging={dragging ? "true" : undefined}
    />
  );
}
