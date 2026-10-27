"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";
import { OnlinePill } from "@/components/AssistantStatus";
import DzIcon from "@/components/DzIcons";
import AnimFigure from "@/components/AnimFigure";
import { shortTitle } from "@/lib/titles";

// 9 Oct, the new design's news card, on the desktop home and the phone home.
// It reads only the count: GET /updates releases and marks seen what it
// returns (#387), so a home screen must never call it, or the person would
// lose the very updates the card points at. A count we could not read draws
// no card; a count of zero draws the card with zero, because the two are
// different facts (11 Oct, the FIXED2 design always shows the story).
// #6901 (Giorgi, 22 Oct): the block itself leads nowhere. No title link, no
// arrow, no „all" to /updates. Nothing else in the app links there now; a
// notification still can.
// A row still opens its own case, and a row with no case opens nothing.
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
  // #5382 (Giorgi): „more" opens the same updates in full inside the card,
  // and closes them again. It no longer leaves the home screen.
  const [full, setFull] = useState(false);
  // #7063 (27 Oct, Giorgi G-186): whether the folded rows are cut by the
  // card's height. Only then is there anything for „მეტი" to open.
  const [cut, setCut] = useState(false);
  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const body = unwrapData(await apiFetch<unknown>("/updates/latest"));
        if (!alive || !isRecord(body) || !Array.isArray(body.updates)) return;
        setLatest(body.updates.map(parseLatest).filter((u): u is Latest => u !== null));
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
  // #7063 (27 Oct, backend 08:10Z): the server sends the last three updates.
  // Folded, the block is four or five lines tall; „მეტი" appears only when
  // that cuts something off, and opens the same rows in full in place. It
  // never fetches more. How many there are is the server's.
  const rows = latest && latest.length > 0 ? latest : null;
  const longer = full || cut;

  if (variant === "phone") {
    return (
      <div className={`dz-meet ${className}`} style={style}>
        <div className="dz-fig">
          <AnimFigure clip="ally-walk" />
          <OnlinePill />
        </div>
        {rows ? (
          <div className="dz-report">
            <div className="dz-report-h">
              <b>{t("homeNewsTitle")}</b>
              {count > 0 && <span className="dz-rnew"><i />{tf("newsNew", { n: count })}</span>}
            </div>
            <LatestRows rows={rows} full={full} onCut={setCut} />
            {longer && (
              <button type="button" className="dz-more" aria-expanded={full} onClick={() => setFull((v) => !v)}>{t("homeNewsMore")} <DzIcon name={full ? "up" : "down"} size={11} /></button>
            )}
          </div>
        ) : (
          <div className="dz-report">
            <div className="dz-report-h">
              <b>{t("homeNewsTitle")}</b>
              {count > 0 && <span className="dz-rnew"><i />{tf("newsNew", { n: count })}</span>}
            </div>
            <p>{story}{extra}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`dz-news-row ${className}`} style={style}>
      <AnimFigure clip="ally-walk" />
      {rows ? (
        <div className="dz-news">
          <div className="dz-news-title">
            <span>{t("homeNewsTitle")}</span>
            {count > 0 && <span className="dz-new-badge">{count}</span>}
          </div>
          <LatestRows rows={rows} full={full} onCut={setCut} />
          {longer && (
            <button type="button" className="dz-news-more" aria-expanded={full} onClick={() => setFull((v) => !v)}>{t("homeNewsMore")} <DzIcon name={full ? "up" : "down"} size={11} /></button>
          )}
        </div>
      ) : (
        <div className="dz-news">
          <div className="dz-news-title">
            <span>{t("homeNewsTitle")}</span>
            {count > 0 && <span className="dz-new-badge">{count}</span>}
          </div>
          <p>{story}{extra}</p>
        </div>
      )}
    </div>
  );
}



type Latest = { ref: string; threadId: string | null; caseTitle: string | null; title: string; detail: string; line: string };

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
    // 5215: the case's own short title, absent on an older server.
    caseTitle: str(v.case_title) || null,
    title,
    detail,
    line,
  };
}

// 5215: updates of one case (the same thread_id, which is identity, never
// the title text) are drawn under the case's name once. A group keeps the
// place of its newest row. An update with no conversation is its own group.
type LatestGroup = { key: string; threadId: string | null; name: string; rows: Latest[] };

function groupLatest(rows: Latest[]): LatestGroup[] {
  const out: LatestGroup[] = [];
  const byThread = new Map<string, LatestGroup>();
  for (const u of rows) {
    const found = u.threadId ? byThread.get(u.threadId) : undefined;
    if (found) {
      found.rows.push(u);
      continue;
    }
    const g: LatestGroup = {
      key: u.threadId ? `t:${u.threadId}` : `u:${u.ref}`,
      threadId: u.threadId,
      // The server's case title; while it has none, the update's title cut
      // to its first four words.
      name: u.title ? shortTitle(u.caseTitle, u.title, 4) : u.caseTitle ?? "",
      rows: [u],
    };
    out.push(g);
    if (u.threadId) byThread.set(u.threadId, g);
  }
  return out;
}

// What happened, without the case's name, which the group already says.
function whatHappened(u: Latest): string {
  return u.detail || u.line || u.title;
}

// A row with a case opens it; one without is plain text (#6901).
function RowLink({ href, className, children }: { href: string | null; className?: string; children: ReactNode }) {
  return href ? (
    <Link href={href} prefetch={false} className={className}>{children}</Link>
  ) : (
    <span className={className}>{children}</span>
  );
}

// One case per entry: its name in bold, then what happened. A case with one
// update reads on one line; a case with more draws its name once and each
// update under it. Drawn from the parts rather than from `line`, which joins
// them with a dash.
function LatestRows({ rows, full, onCut }: { rows: Latest[]; full: boolean; onCut: (cut: boolean) => void }) {
  // Measured, not guessed: the folded list is cut by its CSS height, and only
  // the browser knows whether these words on this screen fill it.
  const ref = useRef<HTMLUListElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || full) return;
    const ro = new ResizeObserver(() => onCut(el.scrollHeight > el.clientHeight + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, [full, rows, onCut]);
  return (
    <ul ref={ref} className={full ? "dz-latest full" : "dz-latest"}>
      {groupLatest(rows).map((g) => {
        const href = g.threadId ? `/chat/${encodeURIComponent(g.threadId)}` : null;
        if (g.rows.length === 1) {
          const u = g.rows[0];
          return (
            <li key={g.key}>
              <RowLink href={href}>
                {g.name && u.detail ? (
                  <>
                    <b>{g.name}</b> {u.detail}
                  </>
                ) : (
                  u.line || u.title || u.detail
                )}
              </RowLink>
            </li>
          );
        }
        return (
          <li key={g.key} className="grp">
            <RowLink href={href}>
              <b>{g.name}</b>
            </RowLink>
            {g.rows.map((u) => (
              <RowLink key={u.ref} href={href} className="sub">
                {whatHappened(u)}
              </RowLink>
            ))}
          </li>
        );
      })}
    </ul>
  );
}
