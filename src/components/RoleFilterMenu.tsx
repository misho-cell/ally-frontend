"use client";

// #9049 (Giorgi, 13 Nov): the phone's role filter, as an icon button to the
// right of the search. A tap opens a small menu of the four roles with the
// chosen one ticked. While a role other than "all" is chosen, the button is
// tinted and carries a dot, so a filtered list never looks like the whole
// list. The desktop keeps its row of buttons; CSS hides this there.

import { useEffect, useRef, useState } from "react";
import DzIcon from "@/components/DzIcons";
import { t } from "@/lib/i18n";

export type RoleFilter = "all" | "initiator" | "mediator" | "addressee";

const ROLES: RoleFilter[] = ["all", "initiator", "mediator", "addressee"];

function roleLabel(r: RoleFilter): string {
  return r === "all" ? t("roleAll") : r === "initiator" ? t("roleInitiator") : r === "mediator" ? t("roleMediator") : t("roleAddressee");
}

export default function RoleFilterMenu({ value, onChange }: { value: RoleFilter; onChange: (r: RoleFilter) => void }) {
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // A tap anywhere else, or Escape, closes the menu without changing the filter.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active = value !== "all";
  return (
    <div className="dz-filter" ref={boxRef}>
      <button
        type="button"
        className="dz-filter-btn"
        data-active={active || undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={active ? `${t("roleFilterButton")}: ${roleLabel(value)}` : t("roleFilterButton")}
        onClick={() => setOpen((o) => !o)}
      >
        <DzIcon name="funnel" size={18} />
        {active && <span className="dz-filter-dot" aria-hidden="true" />}
      </button>
      {open && (
        <div className="dz-filter-menu" role="menu">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              role="menuitemradio"
              aria-checked={value === r}
              onClick={() => {
                onChange(r);
                setOpen(false);
              }}
            >
              <span>{roleLabel(r)}</span>
              {value === r && <DzIcon name="check" size={16} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
