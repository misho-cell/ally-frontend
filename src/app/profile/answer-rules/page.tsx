"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale, fmtDateLoc } from "@/lib/i18n";

// Task 7 (8 Sept, D120): when the user confirms an answer to an incoming
// question and says "always answer these like this", the backend saves a
// rule and answers matching questions itself. The user must be able to see
// those rules and delete them. Creation happens in chat, never here.
const L = {
  en: {
    back: "← Profile",
    title: "Automatic answers",
    intro: "When you tell the assistant to always answer a kind of question a certain way, it remembers the rule and answers similar questions for you. You can remove any rule here.",
    empty: "No rules yet. When you confirm an answer to an incoming question, the assistant will offer to remember it.",
    colQuestion: "Question sample",
    colAnswer: "Answer",
    colUses: "Used",
    colLast: "Last used",
    remove: "Remove",
    confirmRemove: "Remove this automatic answer?",
    genericError: "Something went wrong",
    times: (n: number) => `${n}×`,
    never: "never",
  },
  ka: {
    back: "← პროფილი",
    title: "ავტომატური პასუხები",
    intro: "როცა ასისტენტს ეუბნები, რომ ასეთ კითხვას ყოველთვის ასე უპასუხოს, ის წესს იმახსოვრებს და მსგავს კითხვებს თავად პასუხობს. ნებისმიერი წესის წაშლა აქ შეგიძლია.",
    empty: "წესი ჯერ არ არის, შემოსულ კითხვაზე პასუხის დადასტურებისას ასისტენტი შემოგთავაზებს დამახსოვრებას.",
    colQuestion: "კითხვის ნიმუში",
    colAnswer: "პასუხი",
    colUses: "გამოყენებული",
    colLast: "ბოლოს",
    remove: "წაშლა",
    confirmRemove: "წავშალო ეს ავტომატური პასუხი?",
    genericError: "რაღაც შეცდომა მოხდა",
    times: (n: number) => `${n}-ჯერ`,
    never: "არასდროს",
  },
};

type Rule = {
  id: number | string;
  kind?: string | null;
  sample_question?: string | null;
  answer?: string | null;
  uses?: number | null;
  last_used_at?: string | null;
  created_at?: string | null;
};

export default function AnswerRulesPage() {
  const s = L[getLocale()];
  const [rules, setRules] = useState<Rule[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<{ data?: Rule[] } & { [k: string]: unknown }>("/profile/answer-rules");
      const data = Array.isArray(res.data) ? res.data : Array.isArray(res) ? (res as unknown as Rule[]) : [];
      setRules(data);
    } catch (err) {
      setRules([]);
      setError(err instanceof ApiError ? err.message : s.genericError);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { load(); }, [load]);

  async function remove(r: Rule) {
    if (!window.confirm(s.confirmRemove)) return;
    setBusyId(String(r.id));
    setError(null);
    try {
      await apiFetch(`/profile/answer-rules/${encodeURIComponent(String(r.id))}`, { method: "DELETE" });
      setRules((prev) => (prev ? prev.filter((x) => String(x.id) !== String(r.id)) : prev));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : s.genericError);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex flex-col" style={{ maxWidth: "620px", padding: "28px 24px 40px", gap: "14px" }}>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/profile" className="transition-colors" style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}>{s.back}</Link>
          <span style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</span>
        </div>

        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.intro}</p>

        {error && (
          <div className="px-4 py-3 text-sm" style={{ background: "var(--terra-tint)", color: "var(--danger)", borderRadius: "var(--radius-tile)" }}>{error}</div>
        )}

        {rules === null ? (
          <div className="flex flex-col gap-3">
            <span className="sk-bar" style={{ width: "100%", height: 72, borderRadius: "var(--radius-card)" }} />
            <span className="sk-bar" style={{ width: "100%", height: 72, borderRadius: "var(--radius-card)" }} />
          </div>
        ) : rules.length === 0 ? (
          <div className="card"><p className="text-sm" style={{ color: "var(--meta)" }}>{s.empty}</p></div>
        ) : (
          <div className="flex flex-col gap-3">
            {rules.map((r) => (
              <div key={String(r.id)} className="card flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <p style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{r.sample_question || "—"}</p>
                  <button
                    type="button"
                    disabled={busyId === String(r.id)}
                    onClick={() => remove(r)}
                    className="shrink-0 transition-colors disabled:opacity-50"
                    style={{ fontSize: "12.5px", color: "var(--danger)" }}
                  >
                    {s.remove}
                  </button>
                </div>
                {r.answer && <p style={{ fontSize: "13px", color: "var(--ink-2)" }}>{r.answer}</p>}
                <div className="flex flex-wrap gap-x-4 gap-y-1" style={{ fontSize: "12px", color: "var(--meta)" }}>
                  <span>{s.colUses}: {s.times(Number(r.uses ?? 0))}</span>
                  <span>{s.colLast}: {r.last_used_at ? fmtDateLoc(r.last_used_at) : s.never}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
