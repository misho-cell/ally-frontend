"use client";

import { useCallback, useEffect, useState } from "react";
import SheetPage from "@/components/SheetPage";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// The questions about you (task 1917; design phone 54; backend 0302,
// 14 Oct). The design says „seven"; the server has five core questions, and
// the page draws however many the list gives, so the title names no number.
// Answering goes through the route that already existed, POST
// /profile/feedback, by question id; the list is read again afterwards so
// what is shown is what the server kept.

const L = {
  en: {
    title: "Questions about you",
    back: "Profile",
    intro: "Your answers help Netai know who to ask and how.",
    answer: "Answer",
    change: "Change the answer",
    placeholder: "Write in your own words",
    save: "Save reply",
    cancel: "Cancel",
    empty: "No questions right now.",
    failed: "Could not load",
    saveFailed: "Could not save. Try again.",
  },
  ka: {
    title: "კითხვები შენზე",
    back: "პროფილი",
    intro: "შენი პასუხები Netai-ს ეხმარება გაიგოს, ვის და როგორ მიმართოს.",
    answer: "პასუხი",
    change: "პასუხის შეცვლა",
    placeholder: "ჩაწერე შენი სიტყვებით",
    save: "პასუხის შენახვა",
    cancel: "გაუქმება",
    empty: "ახლა კითხვები არ არის.",
    failed: "ვერ ჩაიტვირთა",
    saveFailed: "ვერ შეინახა. სცადე თავიდან.",
  },
};

type Question = { id: string; text: string; reason: string | null; answered: boolean; answer: string | null };

function parse(raw: unknown): Question[] | null {
  const d = unwrapData(raw);
  if (!isRecord(d) || !Array.isArray(d.questions)) return null;
  return recordItems(pickArray(d.questions)).flatMap((q) => {
    if (typeof q.question_id !== "string" || typeof q.text !== "string" || !q.text.trim()) return [];
    return [{
      id: q.question_id,
      text: q.text,
      reason: typeof q.reason === "string" && q.reason.trim() ? q.reason : null,
      answered: q.answered === true,
      answer: typeof q.answer === "string" && q.answer.trim() ? q.answer : null,
    }];
  });
}

export default function QuestionsPage() {
  const locale = getLocale();
  const s = L[locale];
  const [qs, setQs] = useState<Question[] | null | undefined>(undefined);
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const path = `/profile/questions?lang=${locale}`;

  const reload = useCallback(async () => {
    try { setQs(parse(await apiFetch<unknown>(path))); } catch { setQs(null); }
  }, [path]);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(path)
      .then((raw) => { if (alive) setQs(parse(raw)); })
      .catch(() => { if (alive) setQs(null); });
    return () => { alive = false; };
  }, [path]);

  async function save(id: string) {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setErr(false);
    try {
      await apiFetch("/profile/feedback", { method: "POST", body: { question_id: id, free_text: text } });
      setOpen(null);
      setDraft("");
      await reload();
    } catch {
      setErr(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SheetPage title={s.title} backHref="/profile" backLabel={s.back}>
      <p className="nx-intro">{s.intro}</p>
      {qs === undefined && <span className="sk-bar" style={{ width: "70%" }} />}
      {qs === null && <p className="nx-intro" style={{ color: "var(--danger)" }}>{s.failed}</p>}
      {qs && qs.length === 0 && <p className="nx-empty">{s.empty}</p>}
      {err && <p role="status" className="nx-note" style={{ color: "var(--danger)" }}>{s.saveFailed}</p>}
      {qs && qs.map((q, i) => (
        <div key={q.id} className="nx-card flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <span style={{ font: "600 12px/21px var(--font-system)", color: "var(--meta)" }}>{i + 1}</span>
            <h3 style={{ margin: 0, flex: 1 }}>{q.text}</h3>
          </div>
          {q.reason && <p className="nx-note">{q.reason}</p>}
          {q.answered && q.answer && open !== q.id && <p>{q.answer}</p>}
          {open === q.id ? (
            <div className="flex flex-col gap-2">
              <label className="nx-field" style={{ marginBottom: 0 }}>
                <textarea rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={s.placeholder} style={{ fontSize: 16 }} autoFocus />
              </label>
              <div className="nx-row" style={{ marginTop: 0 }}>
                <button type="button" className="nx-btn primary" disabled={busy || !draft.trim()} onClick={() => save(q.id)}>{s.save}</button>
                <button type="button" className="nx-btn" disabled={busy} onClick={() => { setOpen(null); setDraft(""); }}>{s.cancel}</button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              className={`nx-btn self-start${q.answered ? "" : " primary"}`}
              disabled={busy}
              onClick={() => { setOpen(q.id); setDraft(q.answer ?? ""); }}
            >
              {q.answered ? s.change : s.answer}
            </button>
          )}
        </div>
      ))}
    </SheetPage>
  );
}
