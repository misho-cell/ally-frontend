"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// #1850 (6 Oct). A person gets at most two new questions a day at once; the
// rest are held and arrive together at 19:00 their time, as one push that
// opens this screen. Each item is an ordinary ask with its own conversation,
// so a tap here sends exactly what the button in that conversation sends.
//
// Three states are kept apart on purpose: the card failed to load, there is
// no card, and there is a card. "Could not load" must never read as "nothing
// waits", because the second one tells the person they can stop looking.
//
// Answered items stay on the list, marked done, so the rows under a finger do
// not move between taps. The card is not re-fetched after a tap for the same
// reason: once the last item is answered the server returns no card, and the
// whole list would vanish under the person who just finished it.

const L = {
  en: {
    back: "← Chat",
    title: "Evening card",
    empty: "Nothing new right now.",
    loadFailed: "Could not load",
    retry: "Try again",
    answered: "Answer sent",
    open: "Open the conversation",
    sendFailed: "Could not send.",
    snooze: "In 2 hours",
    snoozed: (t: string) => `Postponed. It comes back at ${t}.`,
    snoozedNoTime: "Postponed.",
    snoozeFailed: "Could not postpone it. It is still here.",
  },
  ka: {
    back: "← ჩატი",
    title: "საღამოს ბარათი",
    empty: "ახალი ჯერ არაფერია.",
    loadFailed: "ვერ ჩაიტვირთა",
    retry: "თავიდან",
    answered: "პასუხი გაიგზავნა",
    open: "საუბრის გახსნა",
    sendFailed: "ვერ გაიგზავნა.",
    snooze: "2 საათში",
    snoozed: (t: string) => `გადაიდო. დაგიბრუნდება ${t}.`,
    snoozedNoTime: "გადაიდო.",
    snoozeFailed: "ვერ გადაიდო. ისევ აქ არის.",
  },
};

type Item = {
  askId: number;
  threadId: number;
  fromName: string | null;
  question: string;
  answered: boolean;
};

type Card = {
  id: number;
  choices: string[];
  items: Item[];
};

function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

function parseCard(raw: unknown): Card | null {
  const d = unwrapData(raw);
  const c = isRecord(d) ? d.card : null;
  if (!isRecord(c)) return null;
  const id = num(c.id);
  if (id == null) return null;
  const choices = pickArray(c.choices).filter((x): x is string => typeof x === "string" && x.trim() !== "");
  const items: Item[] = [];
  for (const it of recordItems(pickArray(c.items))) {
    const askId = num(it.ask_id);
    const threadId = num(it.ask_thread_id);
    if (askId == null || threadId == null) continue;
    items.push({
      askId,
      threadId,
      fromName: typeof it.from_name === "string" && it.from_name.trim() !== "" ? it.from_name : null,
      question: typeof it.question === "string" ? it.question : "",
      answered: it.answered === true,
    });
  }
  return { id, choices, items };
}

// Local wall-clock time. Written by hand rather than toLocaleTimeString so a
// device without ka locale data still shows 21:00 and not 9:00 PM.
function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function EveningCardPage() {
  const s = L[getLocale()];
  // undefined = still loading, null = the server says there is no card.
  const [card, setCard] = useState<Card | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<number | null>(null);
  const [failedAsk, setFailedAsk] = useState<number | null>(null);
  const [snoozing, setSnoozing] = useState(false);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);

  const load = useCallback(() => {
    setError(null);
    setCard(undefined);
    apiFetch<unknown>("/evening-card")
      .then((raw) => setCard(parseCard(raw)))
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 401) return;
        setError(s.loadFailed);
      });
  }, [s.loadFailed]);

  useEffect(() => {
    let live = true;
    apiFetch<unknown>("/evening-card")
      .then((raw) => { if (live) setCard(parseCard(raw)); })
      .catch((e: unknown) => {
        if (!live || (e instanceof ApiError && e.status === 401)) return;
        setError(s.loadFailed);
      });
    return () => { live = false; };
  }, [s.loadFailed]);

  const answer = async (item: Item, choice: string) => {
    if (busy != null) return;
    setBusy(item.askId);
    setFailedAsk(null);
    try {
      await apiFetch(`/threads/${item.threadId}/message`, { method: "POST", body: { message: choice } });
      setCard((c) =>
        c ? { ...c, items: c.items.map((it) => (it.askId === item.askId ? { ...it, answered: true } : it)) } : c
      );
    } catch {
      setFailedAsk(item.askId);
    } finally {
      setBusy(null);
    }
  };

  const snooze = async () => {
    if (!card || snoozing) return;
    setSnoozing(true);
    setNotice(null);
    try {
      const raw = await apiFetch<unknown>(`/evening-card/${card.id}/snooze`, { method: "POST" });
      const d = unwrapData(raw);
      const due = isRecord(d) && typeof d.due_at === "string" ? fmtTime(d.due_at) : "";
      // A 200 without a readable time is still a postponement; say so without
      // inventing the hour.
      setNotice({ text: due ? s.snoozed(due) : s.snoozedNoTime, ok: true });
    } catch {
      setNotice({ text: s.snoozeFailed, ok: false });
      setSnoozing(false);
    }
  };

  const snoozed = notice?.ok === true;

  return (
    <div className="min-h-full" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-6">
        <Link href="/chat" style={{ font: "500 13px/18px var(--font-system)", color: "var(--ink-soft)" }}>
          {s.back}
        </Link>

        <h1 style={{ font: "500 24px/30px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</h1>

        {notice && (
          <p
            role="status"
            style={{
              font: "500 13px/19px var(--font-system)",
              color: notice.ok ? "var(--ink-soft)" : "var(--danger)",
            }}
          >
            {notice.text}
          </p>
        )}

        {error && (
          <div className="flex flex-col items-start gap-2">
            <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--danger)" }}>{error}</p>
            <button type="button" className="btn-secondary" onClick={load}>{s.retry}</button>
          </div>
        )}

        {!error && card === undefined && <span className="sk-bar" style={{ width: "80%" }} />}

        {!error && card === null && (
          <p style={{ font: "400 13px/19px var(--font-system)", color: "var(--meta)" }}>{s.empty}</p>
        )}

        {!error && card && (
          <>
            <div className="flex flex-col gap-3">
              {card.items.map((it) => (
                <div key={it.askId} className="card flex flex-col gap-2" style={it.answered ? { opacity: 0.7 } : undefined}>
                  {it.fromName && (
                    <span style={{ font: "500 12.5px/17px var(--font-system)", color: "var(--meta)" }}>{it.fromName}</span>
                  )}
                  <p style={{ font: "400 15px/22px var(--font-system)", color: "var(--ink)", whiteSpace: "pre-wrap" }}>
                    {it.question}
                  </p>
                  {it.answered ? (
                    <div className="flex flex-wrap items-center gap-3">
                      <span style={{ font: "500 13px/19px var(--font-system)", color: "var(--ink-soft)" }}>{s.answered}</span>
                      <Link href={`/chat/${it.threadId}`} style={{ font: "500 13px/19px var(--font-system)", color: "var(--ink-soft)", textDecoration: "underline" }}>
                        {s.open}
                      </Link>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {card.choices.map((ch, i) => (
                        <button
                          key={i}
                          type="button"
                          className={i === 0 ? "btn-primary" : "btn-secondary"}
                          disabled={busy != null}
                          onClick={() => answer(it, ch)}
                        >
                          {ch}
                        </button>
                      ))}
                    </div>
                  )}
                  {failedAsk === it.askId && (
                    <p role="status" style={{ font: "500 13px/19px var(--font-system)", color: "var(--danger)" }}>{s.sendFailed}</p>
                  )}
                </div>
              ))}
            </div>

            {card.items.some((it) => !it.answered) && !snoozed && (
              <button type="button" className="btn-secondary self-start" disabled={snoozing} onClick={snooze}>
                {s.snooze}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
