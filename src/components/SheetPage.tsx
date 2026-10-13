import Link from "next/link";
import type { ReactNode } from "react";
import DzIcon from "@/components/DzIcons";

// 9 Oct, the new design (D696). The account pages (updates, the evening card,
// and the ones that follow) open as one shape: a white panel with a header
// band, a square back button on the left, the title, an optional action on
// the right, and the body on the app's own background below. On the desktop
// the design shows it as a dialog over the app; here it is a page drawn the
// same way, so the back button, a reload and a link from a push all keep
// working as they did.
//
// 13 Oct (FIXED2 `.nx-head`): every sheet also carries a close button on the
// right, which leaves the sheet altogether, while back goes one step up. On
// the first page of a sheet the two lead to the same place, and the design
// still draws both, so the close button is always where the hand expects it.

export default function SheetPage({
  title,
  backHref,
  onBack,
  backLabel,
  closeHref = "/chat",
  closeLabel,
  action,
  wideAction = false,
  children,
}: {
  title: string;
  backHref: string;
  // A step inside the same page (the snooze date, say) goes back without a
  // navigation; the link still carries the href for a middle click.
  onBack?: () => void;
  backLabel: string;
  closeHref?: string;
  closeLabel?: string;
  action?: ReactNode;
  // A long action (a full sentence on a button) would squeeze the title on a
  // phone. It then sits under the header there, and in the header from md up.
  wideAction?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="min-h-full md:px-6 md:py-8" style={{ background: "var(--bg)" }}>
      <div
        className="mx-auto flex min-h-dvh w-full max-w-[800px] flex-col overflow-hidden md:min-h-0 md:rounded-[20px] md:border md:border-[#CEDCD6] md:shadow-[0_8px_24px_rgba(36,59,54,0.14)]"
        style={{ background: "var(--bg)" }}
      >
        <header
          className="flex h-[88px] shrink-0 items-center gap-3.5 px-[18px] md:h-auto md:min-h-[78px] md:px-[22px] md:py-4"
          style={{ background: "#FFFFFF", borderBottom: "1px solid var(--nx-line)" }}
        >
          <Link
            href={backHref}
            onClick={onBack ? (e) => { e.preventDefault(); onBack(); } : undefined}
            aria-label={backLabel}
            title={backLabel}
            className="nx-icon"
          >
            <DzIcon name="left" size={18} />
          </Link>
          <h1
            className="min-w-0 flex-1 text-[17px] md:text-[19px]"
            style={{ fontWeight: 650, lineHeight: 1.35, color: "var(--nx-ink)", overflowWrap: "anywhere" }}
          >
            {title}
          </h1>
          {action && (wideAction ? <div className="hidden md:block">{action}</div> : action)}
          <Link href={closeHref} aria-label={closeLabel ?? backLabel} title={closeLabel ?? backLabel} className="nx-icon">
            <DzIcon name="x" size={16} />
          </Link>
        </header>
        <div className="flex flex-col gap-3 p-[18px] pb-[max(24px,env(safe-area-inset-bottom))] md:p-6">
          <div className="mx-auto flex w-full max-w-[680px] flex-col gap-3">
            {action && wideAction && <div className="md:hidden">{action}</div>}
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
