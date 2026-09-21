"use client";

// Task 93. window.confirm() freezes the whole tab until it is answered, and
// nothing outside the dialog can dismiss it — so an admin who walks away
// leaves a wedged browser, and a confirm fired from a background tab can look
// like the page has hung. The app's own dialog blocks nothing: the page keeps
// rendering, Escape and a click outside close it.
//
// The wording is the caller's, because only the caller knows what is about to
// happen. This component only guarantees that the question is asked in a way
// the person can get out of.

import { useEffect } from "react";

export default function ConfirmDialog({
  message,
  confirmLabel,
  cancelLabel = "გაუქმება",
  busy = false,
  danger = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    // Escape closes it, but never mid-request: cancelling the dialog while the
    // action is in flight would leave the person thinking they had stopped
    // something that is already happening.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(18,21,16,0.32)" }}
      onClick={() => !busy && onCancel()}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="whitespace-pre-wrap text-sm text-[#23261F]">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`flex min-w-28 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 ${
              danger ? "bg-red-600" : "bg-[#23261F]"
            }`}
          >
            {busy ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              confirmLabel
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
