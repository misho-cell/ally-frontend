"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

// F-2 (5 Sept): founder review of the target list — the one step of ticket 9
// that can't live on the backend. Every machine signal can rank someone #1
// while the real reason not to write to them (family, friendship, a private
// history) exists nowhere in the database. So: the list, and two buttons per
// row.
//
// Rules the UI must not break (from the backend brief):
//   1. "არა" is a real deletion — the person leaves every future list. Confirm.
//   2. "neither" is a fully valid answer. Rows may stay undecided; the server
//      leaves anything that is not კი/არა untouched.
//   3. parts.bubble may be null = "not measured", NOT zero. Draw a dash.

type Fit = "strong" | "moderate" | "weak" | "not_yet";

type Candidate = {
  phone: string;
  label: string;
  city: string | null;
  score: number;
  route: "chorus" | "direct";
  inviter: { user_id: number; warmth: number; colour: string | null } | null;
  parts: {
    fit: Fit;
    fit_source: "facts" | "label" | "none";
    fit_evidence: string[];
    reach: number;
    pull: number;
    subscribed_holders: number;
    person_confirmed: boolean;
    bubble: { savers: number; edges: number; density: number } | null;
  };
};

type Decision = { phone: string; decision: string; note: string | null; decided_by: string | null; updated_at: string };

type Pending = { kind: "no"; c: Candidate } | { kind: "undo"; c: Candidate };

const FIT_LABEL: Record<Fit, string> = {
  strong: "ძლიერი",
  moderate: "საშუალო",
  weak: "სუსტი",
  not_yet: "ჯერ არა",
};
const FIT_CLS: Record<Fit, string> = {
  strong: "bg-green-50 text-green-700",
  moderate: "bg-amber-50 text-amber-700",
  weak: "bg-gray-100 text-gray-600",
  not_yet: "bg-gray-50 text-gray-400",
};

function num(v: number | null | undefined, digits = 0): string {
  if (v == null) return "—";
  return digits ? v.toFixed(digits) : String(v);
}

export default function TargetListReviewPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [days, setDays] = useState(30);
  const [error, setError] = useState<string | null>(null);
  const [busyPhone, setBusyPhone] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const bail = useCallback((err: unknown) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      router.replace("/admin/login");
      return true;
    }
    setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    return false;
  }, [router]);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      const [list, dec] = await Promise.all([
        apiFetch<{ data?: unknown } & Record<string, unknown>>(`/admin/target-list?days=${days}`, { admin: true }),
        apiFetch<{ data?: { decisions?: Decision[] }; decisions?: Decision[] }>("/admin/target-list/decisions", { admin: true }),
      ]);
      const body = (list.data ?? list) as Record<string, unknown>;
      const arr = Array.isArray(body)
        ? body
        : (Object.values(body).find((v) => Array.isArray(v)) as unknown[] | undefined) ?? [];
      setRows(arr as Candidate[]);
      const ds = dec.data?.decisions ?? dec.decisions ?? [];
      setDecisions(Object.fromEntries(ds.map((d) => [d.phone, d])));
    } catch (err) {
      bail(err);
    }
  }, [days, bail]);

  useEffect(() => { load(); }, [load]);

  async function decide(c: Candidate, decision: "კი" | "არა") {
    setBusyPhone(c.phone);
    setError(null);
    try {
      const note = (notes[c.phone] ?? "").trim();
      await apiFetch("/admin/target-list/decisions", {
        method: "POST",
        admin: true,
        body: { decisions: [{ phone: c.phone, decision, ...(note ? { note } : {}) }] },
      });
      setDecisions((prev) => ({
        ...prev,
        [c.phone]: { phone: c.phone, decision, note: note || null, decided_by: null, updated_at: new Date().toISOString() },
      }));
    } catch (err) {
      bail(err);
    } finally {
      setBusyPhone(null);
      setPending(null);
    }
  }

  async function undo(c: Candidate) {
    setBusyPhone(c.phone);
    setError(null);
    try {
      await apiFetch(`/admin/target-list/decisions/${encodeURIComponent(c.phone)}`, { method: "DELETE", admin: true });
      setDecisions((prev) => {
        const next = { ...prev };
        delete next[c.phone];
        return next;
      });
    } catch (err) {
      bail(err);
    } finally {
      setBusyPhone(null);
      setPending(null);
    }
  }

  const decided = rows ? rows.filter((r) => decisions[r.phone]).length : 0;

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">სამიზნე სია: დამტკიცება</h1>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-500">
          დღე
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-gray-200 px-2 py-1 text-sm text-[#23261F]"
          >
            {[7, 14, 30, 60, 90].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-6 flex flex-col gap-4">
        <p className="text-xs text-gray-500">
          „კი" სიაში ტოვებს. „არა" ადამიანს ყველა მომავალი სიიდან შლის. სტრიქონის უპასუხოდ დატოვება ნორმაა.
          {rows && <> · {rows.length} კანდიდატი, {decided} გადაწყვეტილი.</>}
        </p>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {!error && rows === null && (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        )}

        {rows && rows.length === 0 && (
          <p className="py-8 text-center text-sm text-gray-400">კანდიდატები ვერ მოიძებნა</p>
        )}

        {rows && rows.length > 0 && (
          <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-gray-500">
                  <th className="px-4 py-2.5 font-semibold">სახელი</th>
                  <th className="px-3 py-2.5 font-semibold">ქულა</th>
                  <th className="px-3 py-2.5 font-semibold">fit</th>
                  <th className="px-3 py-2.5 font-semibold" title="bubble.density">სიმკვრივე</th>
                  <th className="px-3 py-2.5 font-semibold">reach</th>
                  <th className="px-3 py-2.5 font-semibold" title="subscribed_holders">გამომწერები</th>
                  <th className="px-3 py-2.5 font-semibold">მარშრუტი</th>
                  <th className="px-4 py-2.5 font-semibold text-right">გადაწყვეტილება</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const d = decisions[c.phone];
                  const busy = busyPhone === c.phone;
                  const isOpen = !!open[c.phone];
                  const ev = c.parts?.fit_evidence ?? [];
                  return (
                    <tr
                      key={c.phone}
                      className={`border-b border-gray-50 last:border-0 align-top ${d?.decision === "არა" ? "opacity-50" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-semibold text-[#23261F]">{c.label || c.phone}</div>
                        <div className="text-xs text-gray-400">
                          {c.phone}{c.city ? ` · ${c.city}` : ""}
                          {c.parts?.person_confirmed && <span className="ml-1 text-green-600">✓</span>}
                        </div>
                        {ev.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setOpen((p) => ({ ...p, [c.phone]: !isOpen }))}
                            className="mt-1 text-xs text-gray-500 hover:text-gray-700"
                          >
                            {isOpen ? "▾" : "▸"} მტკიცებულება ({ev.length})
                          </button>
                        )}
                        {isOpen && (
                          <ul className="mt-1 max-w-md list-disc pl-4 text-xs text-gray-600">
                            {ev.map((e, i) => <li key={i} className="break-words">{e}</li>)}
                          </ul>
                        )}
                      </td>
                      <td className="px-3 py-3 text-[#23261F]">{num(c.score, 3)}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${FIT_CLS[c.parts?.fit] ?? "bg-gray-50 text-gray-400"}`}>
                          {FIT_LABEL[c.parts?.fit] ?? c.parts?.fit ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-[#23261F]" title={c.parts?.bubble ? `${c.parts.bubble.savers} savers · ${c.parts.bubble.edges} edges` : "არ გაზომილა"}>
                        {num(c.parts?.bubble?.density, 2)}
                      </td>
                      <td className="px-3 py-3 text-[#23261F]">{num(c.parts?.reach)}</td>
                      <td className="px-3 py-3 text-[#23261F]">{num(c.parts?.subscribed_holders)}</td>
                      <td className="px-3 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.route === "chorus" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                          {c.route}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {d ? (
                          <div className="flex flex-col items-end gap-1">
                            <span className={`text-sm font-semibold ${d.decision === "არა" ? "text-red-600" : "text-green-700"}`}>
                              {d.decision}
                            </span>
                            {d.note && <span className="max-w-[160px] truncate text-xs text-gray-400" title={d.note}>{d.note}</span>}
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => setPending({ kind: "undo", c })}
                              className="text-xs text-gray-400 hover:text-gray-600 disabled:opacity-50"
                            >
                              უკან წაღება
                            </button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-end gap-1.5">
                            <div className="flex gap-1.5">
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => decide(c, "კი")}
                                className="rounded-lg bg-[#23261F] px-3 py-1 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                              >
                                კი
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => setPending({ kind: "no", c })}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                არა
                              </button>
                            </div>
                            <input
                              type="text"
                              value={notes[c.phone] ?? ""}
                              onChange={(e) => setNotes((p) => ({ ...p, [c.phone]: e.target.value }))}
                              placeholder="შენიშვნა"
                              className="w-36 rounded-lg border border-gray-200 px-2 py-1 text-xs text-[#23261F]"
                            />
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(18,21,16,0.32)" }}
          onClick={() => !busyPhone && setPending(null)}
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm text-[#23261F]">
              {pending.kind === "no"
                ? `„არა" ${pending.c.label || pending.c.phone}-ს ყველა მომავალი სიიდან შლის. დარწმუნებული ხარ?`
                : `გადაწყვეტილება ${pending.c.label || pending.c.phone}-ზე მოიხსნას? სტრიქონი ისევ უპასუხო გახდება.`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={!!busyPhone}
                onClick={() => setPending(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                გაუქმება
              </button>
              <button
                type="button"
                disabled={!!busyPhone}
                onClick={() => (pending.kind === "no" ? decide(pending.c, "არა") : undo(pending.c))}
                className={`flex w-32 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 ${pending.kind === "no" ? "bg-red-600" : "bg-[#23261F]"}`}
              >
                {busyPhone ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : pending.kind === "no" ? "წაშალე" : "მოხსენი"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
