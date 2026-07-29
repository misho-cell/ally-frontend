"use client";

import { useThreads } from "@/contexts/ThreadsContext";
import { t, tf } from "@/lib/i18n";

// Chat home main pane: E1 (threads exist, none selected) / E2 (first run).
// While the thread list loads, show nothing here — the sidebar carries the
// skeletons; empty-state copy may only appear once loading resolved.
export default function ChatIndexPage() {
  const { threads, threadsLoaded, createThread } = useThreads();
  const incoming = threads.filter((th) => th.type === "incoming_request").length;
  const firstRun = threadsLoaded && threads.length === 0;

  return (
    <div className="hidden md:flex flex-1 h-full flex-col" style={{ background: "var(--bg)" }}>
      {threadsLoaded && (
        <div className="empty">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/assets/ally/rest.jpg"
            alt=""
            className="empty-art"
            style={firstRun ? { width: 170 } : undefined}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <h2>{firstRun ? t("nothingYet") : t("selectThread")}</h2>
          {firstRun ? (
            <p>{t("firstRunBody")}</p>
          ) : incoming > 0 ? (
            <p>{incoming === 1 ? t("waitingRequestOne") : tf("waitingRequests", { n: incoming })}</p>
          ) : null}
          <button type="button" className="btn-primary" onClick={createThread}>
            + {t("newTask")}
          </button>
        </div>
      )}
    </div>
  );
}
