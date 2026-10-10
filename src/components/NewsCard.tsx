"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { t, tf } from "@/lib/i18n";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";

// 9 Oct, the new design's news card, on the desktop home and the phone home.
// It reads only the count: GET /updates releases and marks seen what it
// returns (#387), so a home screen must never call it, or the person would
// lose the very updates the card points at. A count we could not read draws
// no card, rather than a card that says there is nothing new.
export default function NewsCard({ className = "", style }: { className?: string; style?: CSSProperties }) {
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

  if (count == null || count <= 0) return null;
  return (
    <Link
      href="/updates"
      prefetch={false}
      className={`flex flex-col gap-1.5 ${className}`}
      style={{
        padding: "16px 18px", background: "#FFFFFF",
        border: "1px solid var(--cta-border)", borderRadius: 15,
        boxShadow: "var(--shadow-news)", textDecoration: "none",
        ...style,
      }}
    >
      <span className="flex items-center justify-between">
        <span style={{ font: "600 13px/18px var(--font-system)", color: "var(--ink)" }}>{t("homeNewsTitle")}</span>
        <span style={{ font: "600 11px/16px var(--font-system)", color: "var(--accent)", background: "var(--accent-tint)", borderRadius: 8, padding: "1px 8px" }}>
          {count}
        </span>
      </span>
      {lines.length > 0 ? (
        <span className="flex flex-col gap-0.5">
          {lines.map((l, i) => (
            <span key={i} className="truncate" style={{ font: "400 13px/20px var(--font-system)", color: "var(--ink-soft)" }}>
              {l}
            </span>
          ))}
          {/* More are due than the server sent lines for: say how many,
              rather than letting three lines read as the whole story. */}
          {due > lines.length && (
            <span style={{ font: "500 12px/18px var(--font-system)", color: "var(--meta)" }}>+{due - lines.length}</span>
          )}
        </span>
      ) : (
        <span style={{ font: "400 13px/20px var(--font-system)", color: "var(--ink-soft)" }}>
          {tf("homeNewsCount", { n: count })}
        </span>
      )}
      <span style={{ font: "600 12px/16px var(--font-system)", color: "var(--accent)" }}>{t("homeNewsMore")} ›</span>
    </Link>
  );
}
