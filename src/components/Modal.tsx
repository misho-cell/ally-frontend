"use client";

// Design-system modal (ticket 6 #7): replaces native window.prompt/confirm
// dialogs. Same visual language as the earnings confirm dialog: dimmed paper
// backdrop + white card. Click outside closes.
export default function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(18,21,16,0.32)" }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="card w-full max-w-sm flex flex-col gap-4"
        style={{ boxShadow: "var(--shadow-pop)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
