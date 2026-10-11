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
  useEffect(() => {
    let alive = true;
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

  if (variant === "phone") {
    return (
      <div className={`dz-meet ${className}`} style={style}>
        <div className="dz-fig">
          <AnimFigure clip="ally-walk" />
          <OnlinePill />
        </div>
        <Link href="/updates" prefetch={false} className="dz-report">
          <span className="dz-report-h">
            <b>{t("homeNewsTitle")} ›</b>
            {count > 0 && <span className="dz-rnew"><i />{tf("newsNew", { n: count })}</span>}
          </span>
          <p>{story}{extra}</p>
          <span className="dz-more">{t("homeNewsMore")}</span>
        </Link>
      </div>
    );
  }

  return (
    <div className={`dz-news-row ${className}`} style={style}>
      <AnimFigure clip="ally-walk" />
      <Link href="/updates" prefetch={false} className="dz-news">
        <span className="dz-news-title">
          <span>{t("homeNewsTitle")}</span>
          {count > 0 && <span className="dz-new-badge">{count}</span>}
        </span>
        <p>{story}{extra}</p>
        <span className="dz-news-more">{t("homeNewsMore")} <DzIcon name="right" size={11} /></span>
      </Link>
    </div>
  );
}

