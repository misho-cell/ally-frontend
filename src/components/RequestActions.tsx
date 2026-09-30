"use client";

import { t } from "@/lib/i18n";

export type RequestAction = "accept_direct" | "accept_mediator" | "deny" | "later";

// Row 306 (30 Sept). A button carried no explanation of what it does, and of
// every button set in the app this is the one that could not afford it: two of
// these four say yes, and the difference between them is whether a third
// person is handed somebody's phone number. That was written down only in the
// confirmation AFTER the press, which is not a choice, it is a notification.
//
// The labels say what you are choosing. The line under each says what happens.
//
// One component for both places it appears — the bubble in the goal and the
// row in the list — because they were written apart once before and the two
// ways to say yes exist precisely so that neither can become the quiet
// default in one of them.
const ACTIONS: { action: RequestAction; cls: string; label: () => string; note: () => string }[] = [
  { action: "accept_direct", cls: "accept", label: () => t("reqAcceptDirect"), note: () => t("reqAcceptDirectNote") },
  { action: "accept_mediator", cls: "accept", label: () => t("reqAcceptMediator"), note: () => t("reqAcceptMediatorNote") },
  { action: "deny", cls: "deny", label: () => t("reqDeny"), note: () => t("reqDenyNote") },
  { action: "later", cls: "later", label: () => t("reqLater"), note: () => t("reqLaterNote") },
];

export default function RequestActions({
  onResolve,
  stopPropagation = false,
}: {
  onResolve: (action: RequestAction) => void;
  // In the list a press also opens the goal behind it. The press meant the
  // button, not the row.
  stopPropagation?: boolean;
}) {
  return (
    <div className="req-actions">
      {ACTIONS.map((a) => (
        <div key={a.action} className="req-action">
          <button
            className={`req-btn ${a.cls}`}
            onClick={(e) => {
              if (stopPropagation) e.stopPropagation();
              onResolve(a.action);
            }}
          >
            {a.label()}
          </button>
          <span className="req-note">{a.note()}</span>
        </div>
      ))}
    </div>
  );
}
