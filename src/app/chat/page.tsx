"use client";

import { useThreads, taskStatusOf } from "@/contexts/ThreadsContext";
import { t } from "@/lib/i18n";

// Desktop right pane, no goal selected (desktop addendum): dogs clip + one
// line, nothing else. Empty home (never any goals): the §2.7 line instead.
export default function ChatIndexPage() {
  const { threads, threadsLoaded, threadStates, tasks } = useThreads();
  const hasGoals = threads.some((th) =>
    taskStatusOf(th, threadStates[String(th.id)], tasks[String(th.id)]) !== null
  );

  return (
    <div className="hidden md:flex flex-1 h-full flex-col" style={{ background: "var(--bg)" }}>
      {threadsLoaded && (
        <div className="empty">
          <video
            className="ally-anim"
            style={{ width: "auto", height: 160 }}
            autoPlay muted loop playsInline
            src="/assets/ally/anim/ally-dogs.mp4"
            poster="/assets/ally/anim/ally-dogs-poster.jpg"
            onError={(e) => { e.currentTarget.style.display = "none"; }}
          />
          <h2>{hasGoals ? t("selectThread") : t("emptyHome")}</h2>
        </div>
      )}
    </div>
  );
}
