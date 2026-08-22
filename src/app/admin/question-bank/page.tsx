"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

// Question-bank editor (task 25, Part H #1): 43 rows that drive the profile
// enrichment questions. GET lists everything; PUT does a PARTIAL update per
// question_id (same pattern as /admin/netai-info) — only edited fields are
// sent, everything else is left untouched server-side.

type Question = {
  question_id: string;
  category: string;
  surface: string;
  prompt_ka: string;
  prompt_en: string;
  prompt_es: string;
  options: unknown;
  score_vector: unknown;
  immediate_use: string;
  select_mode: string;
  select_max: number | null;
  goal_bound: boolean;
  active: boolean;
};

type Draft = {
  category: string;
  surface: string;
  prompt_ka: string;
  prompt_en: string;
  prompt_es: string;
  options: string; // edited as raw JSON text
  score_vector: string; // edited as raw JSON text
  immediate_use: string;
  select_mode: string;
  select_max: string;
  goal_bound: boolean;
  active: boolean;
};

function jsonPretty(v: unknown): string {
  try {
    return JSON.stringify(v ?? null, null, 2);
  } catch {
    return "null";
  }
}

function toDraft(q: Question): Draft {
  return {
    category: q.category ?? "",
    surface: q.surface ?? "",
    prompt_ka: q.prompt_ka ?? "",
    prompt_en: q.prompt_en ?? "",
    prompt_es: q.prompt_es ?? "",
    options: jsonPretty(q.options),
    score_vector: jsonPretty(q.score_vector),
    immediate_use: q.immediate_use ?? "",
    select_mode: q.select_mode ?? "",
    select_max: q.select_max == null ? "" : String(q.select_max),
    goal_bound: !!q.goal_bound,
    active: q.active !== false,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(raw: any): Question[] {
  const d = raw?.data ?? raw;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const arr: any[] = Array.isArray(d) ? d : Array.isArray(d?.questions) ? d.questions : [];
  return arr.filter((x) => x && x.question_id);
}

export default function QuestionBankAdminPage() {
  const router = useRouter();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<unknown>("/admin/question-bank", { admin: true });
      setQuestions(normalize(res));
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setQuestions([]);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  function openEditor(q: Question) {
    setOpenId(q.question_id);
    setDraft(toDraft(q));
    setJsonError(null);
    setNotice(null);
    setError(null);
  }

  async function save(q: Question) {
    if (!draft || saving) return;
    setJsonError(null);

    let options: unknown;
    let scoreVector: unknown;
    try {
      options = JSON.parse(draft.options);
    } catch {
      setJsonError("options: JSON არასწორია");
      return;
    }
    try {
      scoreVector = JSON.parse(draft.score_vector);
    } catch {
      setJsonError("score_vector: JSON არასწორია");
      return;
    }

    const selectMax = draft.select_max.trim() === "" ? null : parseInt(draft.select_max, 10);
    if (draft.select_max.trim() !== "" && !Number.isFinite(selectMax)) {
      setJsonError("select_max: მთელი რიცხვი უნდა იყოს");
      return;
    }

    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      await apiFetch<unknown>(`/admin/question-bank/${encodeURIComponent(q.question_id)}`, {
        method: "PUT",
        body: {
          category: draft.category,
          surface: draft.surface,
          prompt_ka: draft.prompt_ka,
          prompt_en: draft.prompt_en,
          prompt_es: draft.prompt_es,
          options,
          score_vector: scoreVector,
          immediate_use: draft.immediate_use,
          select_mode: draft.select_mode,
          select_max: selectMax,
          goal_bound: draft.goal_bound,
          active: draft.active,
        },
        admin: true,
      });
      setNotice(`შენახულია ✓ (${q.question_id})`);
      setOpenId(null);
      setDraft(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "ვერ შეინახა");
    } finally {
      setSaving(false);
    }
  }

  function setField<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">კითხვათა ბანკი (question-bank)</h1>
        </div>
        <a
          href="/admin/netai-info"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[#23261F] text-sm hover:bg-gray-50 transition"
        >
          პროდუქტის ფაქტები →
        </a>
      </header>

      <div className="mx-auto max-w-3xl px-4 py-6 flex flex-col gap-3">
        <p className="text-xs text-gray-500">
          კითხვის არცევა ახსნის დეტალებს. შენახვა მხოლოდ ამ კითხვას აზუსტავს, დეპლოის გარეშე დღევანდელია.
        </p>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}
        {notice && <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">{notice}</div>}

        {questions === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : questions.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-gray-400">კითხვები ვერ მოიძებნა</p>
        ) : (
          questions.map((q) => (
            <div key={q.question_id} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => (openId === q.question_id ? (setOpenId(null), setDraft(null)) : openEditor(q))}
                className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#23261F]">{q.question_id}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{q.category || "—"}</span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">{q.surface || "—"}</span>
                    {q.active === false && (
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">გათიშული</span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-xs text-gray-500">{q.prompt_ka || q.prompt_en || "—"}</p>
                </div>
                <span className="shrink-0 text-gray-400">{openId === q.question_id ? "▾" : "▸"}</span>
              </button>

              {openId === q.question_id && draft && (
                <div className="flex flex-col gap-3 border-t border-gray-100 p-5">
                  {jsonError && <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{jsonError}</div>}

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="category" value={draft.category} onChange={(v) => setField("category", v)} />
                    <Field label="surface" value={draft.surface} onChange={(v) => setField("surface", v)} />
                  </div>

                  <TextArea label="prompt_ka" value={draft.prompt_ka} onChange={(v) => setField("prompt_ka", v)} rows={2} />
                  <TextArea label="prompt_en" value={draft.prompt_en} onChange={(v) => setField("prompt_en", v)} rows={2} />
                  <TextArea label="prompt_es" value={draft.prompt_es} onChange={(v) => setField("prompt_es", v)} rows={2} />

                  <TextArea label="options (JSON)" value={draft.options} onChange={(v) => setField("options", v)} rows={5} mono />
                  <TextArea label="score_vector (JSON)" value={draft.score_vector} onChange={(v) => setField("score_vector", v)} rows={4} mono />

                  <TextArea label="immediate_use" value={draft.immediate_use} onChange={(v) => setField("immediate_use", v)} rows={2} />

                  <div className="grid grid-cols-2 gap-3">
                    <Field label="select_mode" value={draft.select_mode} onChange={(v) => setField("select_mode", v)} />
                    <Field label="select_max" value={draft.select_max} onChange={(v) => setField("select_max", v)} placeholder="ცარიელი = ნდობით" />
                  </div>

                  <div className="flex gap-6">
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={draft.goal_bound} onChange={(e) => setField("goal_bound", e.target.checked)} />
                      goal_bound
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700">
                      <input type="checkbox" checked={draft.active} onChange={(e) => setField("active", e.target.checked)} />
                      active
                    </label>
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => save(q)}
                      disabled={saving}
                      className="flex h-10 w-32 items-center justify-center rounded-xl bg-[#23261F] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {saving ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                      ) : (
                        "შენახვა"
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOpenId(null); setDraft(null); }}
                      disabled={saving}
                      className="h-10 rounded-xl border border-gray-200 px-5 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                    >
                      გაუქმება
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none transition-colors focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10"
      />
    </div>
  );
}

function TextArea({
  label, value, onChange, rows, mono,
}: { label: string; value: string; onChange: (v: string) => void; rows: number; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-gray-500">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className={`rounded-xl border border-gray-200 px-3 py-2 text-sm leading-relaxed outline-none transition-colors focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10 ${mono ? "font-mono text-xs" : ""}`}
      />
    </div>
  );
}
