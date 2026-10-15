"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";
import { OnlinePill } from "@/components/AssistantStatus";
import DzIcon from "@/components/DzIcons";
import AnimFigure from "@/components/AnimFigure";

// 9 Oct, the new design's news card, on the desktop home and the phone home.
// It reads only the count: GET /updates releases and marks seen what it
// returns (#387), so a home screen must never call it, or the person would
// lose the very updates the card points at. A count we could not read draws
// no card; a count of zero draws the card with zero, because the two are
// different facts (11 Oct, the FIXED2 design always shows the story).
export default function NewsCard({ variant, className = "", style }: { variant: "phone" | "desktop"; className?: string; style?: CSSProperties }) {
  const [count, setCount] = useState<number | null>(null);
  // 10 Oct (backend 08:20Z): up to three lines, the due cards' own title and
  // detail, still read-only. The design writes the story from them. Absent on
  // an older server, and then the card keeps its count sentence.
  const [lines, setLines] = useState<string[]>([]);
  const [due, setDue] = useState(0);
  // 5121 (Giorgi): the three newest updates, read-only (GET /updates/latest
  // releases nothing and marks nothing seen). null means not read: an older
  // server without the route, or a failure, and then the card keeps the
  // count story above. An empty list keeps today's empty state too.
  const [latest, setLatest] = useState<Latest[] | null>(null);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = unwrapData(await apiFetch<unknown>("/updates/latest"));
        if (!alive || !isRecord(body) || !Array.isArray(body.updates)) return;
        setLatest(body.updates.map(parseLatest).filter((u): u is Latest => u !== null).slice(0, 3));
      } catch { /* the count story stays */ }
    })();
    void (async () => {
      try {
        const body = unwrapData(await apiFetch<unknown>("/updates/count"));
        if (!alive || !isRecord(body) || typeof body.due !== "number") return;
        setCount(body.due + (typeof body.followed === "number" ? body.followed : 0));
        setDue(body.due);
        if (Array.isArray(body.lines)) {
          setLines(body.lines.filter((l): l is string => typeof l === "string" && l.trim() !== "").slice(0, 3));
        }
      } catch { /* no card */ }
    })();
    return () => { alive = false; };
  }, []);

  // Zero is drawn too, as zero: the card is the way to the updates screen
  // on the phone, and "nothing new" is a fact the person may want. Only a
  // count we could not read draws nothing.
  if (count == null) return null;
  const story = lines.length > 0 ? lines.join(" ") : tf("homeNewsCount", { n: count });
  const extra = due > lines.length && lines.length > 0 ? ` +${due - lines.length}` : "";
  const rows = latest && latest.length > 0 ? latest : null;

  if (variant === "phone") {
    return (
      <div className={`dz-meet ${className}`} style={style}>
        <div className="dz-fig">
          <AnimFigure clip="ally-walk" />
          <OnlinePill />
        </div>
        {rows ? (
          <div className="dz-report">
            <Link href="/updates" prefetch={false} className="dz-report-h">
              <b>{t("homeNewsTitle")} ›</b>
              {count > 0 && <span className="dz-rnew"><i />{tf("newsNew", { n: count })}</span>}
            </Link>
            <LatestRows rows={rows} />
            <Link href="/updates" prefetch={false} className="dz-more">{t("homeNewsMore")}</Link>
          </div>
        ) : (
          <Link href="/updates" prefetch={false} className="dz-report">
            <span className="dz-report-h">
              <b>{t("homeNewsTitle")} ›</b>
              {count > 0 && <span className="dz-rnew"><i />{tf("newsNew", { n: count })}</span>}
            </span>
            <p>{story}{extra}</p>
            <span className="dz-more">{t("homeNewsMore")}</span>
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={`dz-news-row ${className}`} style={style}>
      <AnimFigure clip="ally-walk" />
      {rows ? (
        <div className="dz-news">
          <Link href="/updates" prefetch={false} className="dz-news-title">
            <span>{t("homeNewsTitle")}</span>
            {count > 0 && <span className="dz-new-badge">{count}</span>}
          </Link>
          <LatestRows rows={rows} />
          <Link href="/updates" prefetch={false} className="dz-news-more">{t("homeNewsMore")} <DzIcon name="right" size={11} /></Link>
        </div>
      ) : (
        <Link href="/updates" prefetch={false} className="dz-news">
          <span className="dz-news-title">
            <span>{t("homeNewsTitle")}</span>
            {count > 0 && <span className="dz-new-badge">{count}</span>}
          </span>
          <p>{story}{extra}</p>
          <span className="dz-news-more">{t("homeNewsMore")} <DzIcon name="right" size={11} /></span>
        </Link>
      )}
    </div>
  );
}


type Latest = { ref: string; threadId: string | null; title: string; detail: string; line: string };

function parseLatest(v: unknown): Latest | null {
  if (!isRecord(v)) return null;
  const str = (x: unknown) => (typeof x === "string" ? x.trim() : "");
  const title = str(v.title);
  const detail = str(v.detail);
  const line = str(v.line);
  if (!title && !detail && !line) return null;
  const tid = v.thread_id;
  return {
    ref: str(v.update_ref) || `${String(tid)}:${line || title}`,
    // thread_id is the conversation to open; null for an update with no goal.
    threadId: typeof tid === "number" || (typeof tid === "string" && tid.trim()) ? String(tid) : null,
    title,
    detail,
    line,
  };
}

// One line per update: the case in bold, then what happened. Drawn from the
// two parts rather than from `line`, which joins them with a dash. A row with
// no conversation opens the updates screen, which a person tapping may spend.
function LatestRows({ rows }: { rows: Latest[] }) {
  return (
    <ul className="dz-latest">
      {rows.map((u) => (
        <li key={u.ref}>
          <Link href={u.threadId ? `/chat/${encodeURIComponent(u.threadId)}` : "/updates"} prefetch={false}>
            {u.title && u.detail ? (
              <>
                <b>{u.title}</b> {u.detail}
              </>
            ) : (
              u.line || u.title || u.detail
            )}
          </Link>
        </li>
      ))}
    </ul>
  );
}
