import Link from "next/link";
import type { ReactNode } from "react";

// 9 Oct, the new design (D696). The account pages (updates, the evening card,
// and the ones that follow) open as one shape: a white panel with a header
// band, a square back button on the left, the title, an optional action on
// the right, and the body on the app's own background below. On the desktop
// the design shows it as a dialog over the app; here it is a page drawn the
// same way, so the back button, a reload and a link from a push all keep
// working as they did.

export default function SheetPage({
  title,
  backHref,
  backLabel,
  action,
  wideAction = false,
  children,
}: {
  title: string;
  backHref: string;
  backLabel: string;
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
          className="flex items-center gap-3 px-4 py-3.5 md:px-5 md:py-4"
          style={{ background: "#FFFFFF", borderBottom: "1px solid var(--header-border)" }}
        >
          <Link
            href={backHref}
            aria-label={backLabel}
            title={backLabel}
            className="flex shrink-0 items-center justify-center transition-colors hover:bg-black/5"
            style={{ width: 36, height: 36, borderRadius: 12, border: "1.5px solid var(--cta-border)", color: "var(--accent)" }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
          </Link>
          <h1 className="min-w-0 flex-1 truncate" style={{ font: "600 20px/26px var(--font-system)", color: "var(--ink)" }}>
            {title}
          </h1>
          {action && (wideAction ? <div className="hidden md:block">{action}</div> : action)}
        </header>
        <div className="flex flex-col gap-4 px-4 py-5 md:px-[60px] md:py-6">
          {action && wideAction && <div className="md:hidden">{action}</div>}
          {children}
        </div>
      </div>
    </div>
  );
}
