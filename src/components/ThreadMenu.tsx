"use client";

import { useEffect, useRef, useState } from "react";

// 9 Oct, the new design (D696). The thread header carried up to eight
// controls side by side: pin, stop or resume and close, rename, the list, the
// export, share, delete. On a phone that is the bar #507 kept running out of
// width on. The design puts them behind one "…" button, in this order, with
// delete last and set apart in red.
//
// A menu item is only ever listed when it applies. The page decides that, as
// it did when these were separate buttons; this component only draws them.

export type ThreadMenuItem = {
  key: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
};

export default function ThreadMenu({ items, label }: { items: ThreadMenuItem[]; label: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (items.length === 0) return null;

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        title={label}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center justify-center rounded-lg transition-colors hover:bg-black/5"
        style={{ width: 32, height: 32, color: "var(--ink-soft)", border: "1px solid var(--header-border)", background: "#FFFFFF" }}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <circle cx="4.5" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="15.5" cy="10" r="1.6" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 flex flex-col py-1.5"
          style={{
            minWidth: 210,
            background: "#FFFFFF",
            border: "1px solid var(--header-border)",
            borderRadius: 12,
            boxShadow: "var(--shadow-pop)",
          }}
        >
          {items.map((it, i) => (
            <div key={it.key}>
              {it.danger && i > 0 && <div style={{ height: 1, background: "var(--header-border)", margin: "4px 0" }} />}
              <button
                type="button"
                role="menuitem"
                disabled={it.disabled}
                onClick={() => { setOpen(false); it.onSelect(); }}
                className="w-full text-left transition-colors hover:bg-black/5 disabled:opacity-50"
                style={{
                  padding: "10px 16px",
                  font: "500 14px/20px var(--font-system)",
                  color: it.danger ? "var(--danger)" : "var(--ink)",
                }}
              >
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
