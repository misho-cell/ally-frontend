"use client";

import { t } from "@/lib/i18n";

export type RequestAction = "accept_direct" | "deny" | "later";

// Row 306 (30 Sept). A button carried no explanation of what it does, so each
// one states it on the line under it.
//
// #2185 / D709 (7 Oct). The person asked no longer chooses HOW an introduction
// happens: on yes, Netai connects the two. So there is one way to say yes, and
// the second one that kept the number back is gone, by the founder's decision.
// The fourth button is not an answer. It names an intention to type and only
// hands over the composer, the same rule #68 set for every other button set:
// sent, it would cost a turn and the question would be asked again.
//
// One component for both places it appears, the bubble in the goal and the
// row in the list, because they were written apart once before.
const ACTIONS: { action: RequestAction; cls: string; label: () => string; note: () => string }[] = [
  { action: "accept_direct", cls: "accept", label: () => t("reqAcceptDirect"), note: () => t("reqAcceptDirectNote") },
  { action: "deny", cls: "deny", label: () => t("reqDeny"), note: () => t("reqDenyNote") },
  { action: "later", cls: "later", label: () => t("reqLater"), note: () => t("reqLaterNote") },
];

export default function RequestActions({
  onResolve,
  onOther,
  stopPropagation = false,
}: {
  onResolve: (action: RequestAction) => void;
  // Posts nothing. The chat focuses its composer; the list opens the chat.
  onOther: () => void;
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
      <div className="req-action">
        <button
          className="req-btn later"
          onClick={(e) => {
            if (stopPropagation) e.stopPropagation();
            onOther();
          }}
        >
          {t("reqOther")}
        </button>
      </div>
    </div>
  );
}
