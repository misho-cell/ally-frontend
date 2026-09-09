"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems } from "@/lib/payload";

// Task 3 (8 Sept): invite cohorts (Axel's 20-day trials). Each cohort is an
// invite code with its own trial length; closing the door (DELETE) stops new
// sign-ups but keeps existing members. Read-only member list per code.

type Cohort = {
  code: string;
  name?: string | null;
  trial_days?: number | null;
  tier?: string | null;
  active?: boolean | null;
  note?: string | null;
  registered?: number | null;
  created_by?: string | null;
  created_at?: string | null;
};

type Member = {
  day?: string | null;
  name?: string | null;
  status?: string | null;
  trial_ends_at?: string | null;
};

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export default function InviteCohortsPage() {
  const router = useRouter();
  const [cohorts, setCohorts] = useState<Cohort[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [trialDays, setTrialDays] = useState(20);
  const [note, setNote] = useState("");
  const [members, setMembers] = useState<Record<string, Member[]>>({});
  const [memberError, setMemberError] = useState<Record<string, string>>({});
  const [openCode, setOpenCode] = useState<string | null>(null);
  const [busyCode, setBusyCode] = useState<string | null>(null);

  const bail = useCallback((err: unknown, set: (m: string) => void) => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      router.replace("/admin/login");
      return;
    }
    set(err instanceof ApiError ? err.message : "მოქმედება ვერ შესრულდა");
  }, [router]);

  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiFetch<unknown>("/admin/invite-cohorts", { admin: true });
      setCohorts(recordItems(pickArray(unwrapData(res), ["cohorts", "rows", "items"])) as Cohort[]);
    } catch (err) {
      setCohorts([]);
      bail(err, setError);
    }
  }, [bail]);

  useEffect(() => { load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    setFormError(null);
    try {
      await apiFetch("/admin/invite-cohorts", {
        method: "POST",
        admin: true,
        body: { code: code.trim(), name: name.trim(), trial_days: trialDays, ...(note.trim() ? { note: note.trim() } : {}) },
      });
      setCode(""); setName(""); setTrialDays(20); setNote("");
      await load();
    } catch (err) {
      bail(err, setFormError);
    } finally {
      setCreating(false);
    }
  }

  async function closeDoor(c: Cohort) {
    if (!window.confirm(`კოდი „${c.code}" დაიხუროს? ახალი რეგისტრაცია შეჩერდება (არსებული წევრები რჩებიან).`)) return;
    setBusyCode(c.code);
    setError(null);
    try {
      await apiFetch(`/admin/invite-cohorts/${encodeURIComponent(c.code)}`, { method: "DELETE", admin: true });
      await load();
    } catch (err) {
      bail(err, setError);
    } finally {
      setBusyCode(null);
    }
  }

  async function toggleMembers(c: Cohort) {
    if (openCode === c.code) { setOpenCode(null); return; }
    setOpenCode(c.code);
    if (members[c.code] || memberError[c.code]) return;
    try {
      const res = await apiFetch<unknown>(`/admin/invite-cohorts/${encodeURIComponent(c.code)}/members`, { admin: true });
      setMembers((prev) => ({ ...prev, [c.code]: recordItems(pickArray(unwrapData(res), ["members", "rows"])) as Member[] }));
    } catch (err) {
      // 404 = no such cohort — show the server's text, not an empty table.
      if (err instanceof ApiError && err.status === 404) {
        setMemberError((prev) => ({ ...prev, [c.code]: err.message || "ასეთი კოჰორტა არ არის" }));
        return;
      }
      bail(err, setError);
    }
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">მოწვევის კოჰორტები</h1>
        </div>
        <button type="button" onClick={load} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50">განახლება</button>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-6 flex flex-col gap-5">
        {/* New cohort */}
        <form onSubmit={create} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[#23261F]">ახალი კოჰორტა</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <input value={code} onChange={(e) => setCode(e.target.value)} required placeholder="კოდი" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#23261F]" />
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="სახელი" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#23261F]" />
            <input type="number" min={0} value={trialDays} onChange={(e) => setTrialDays(Number(e.target.value))} placeholder="დღეები" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#23261F]" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="შენიშვნა (არასავალდებულო)" className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-[#23261F]" />
          </div>
          {formError && <p className="text-sm text-red-600">{formError}</p>}
          <button type="submit" disabled={creating} className="self-start rounded-xl bg-[#23261F] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">
            {creating ? "იქმნება…" : "შექმნა"}
          </button>
        </form>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {cohorts === null ? (
          <div className="flex justify-center py-12"><span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" /></div>
        ) : cohorts.length === 0 && !error ? (
          <p className="py-8 text-center text-sm text-gray-400">კოჰორტა ჯერ არ არის</p>
        ) : (
          <div className="flex flex-col gap-3">
            {cohorts.map((c) => {
              const closed = c.active === false;
              const isOpen = openCode === c.code;
              const ms = members[c.code];
              const mErr = memberError[c.code];
              // Synthetic launch-window cohort (D137): lives in env vars, not a
              // DB row — it can't be closed (DELETE 404s), so hide the button.
              const synthetic = (c.created_by ?? "").includes("D137");
              return (
                <div key={c.code} className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="flex items-center justify-between gap-3 px-5 py-3.5">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-[#23261F]">{c.code}</span>
                        {c.name && <span className="text-sm text-[#23261F]">{c.name}</span>}
                        {c.trial_days != null && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">{c.trial_days} დღე</span>}
                        {closed && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-semibold text-gray-500">დახურული</span>}
                        {synthetic && <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">launch window</span>}
                      </div>
                      {c.note && <p className="mt-1 truncate text-xs text-gray-500">{c.note}</p>}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-gray-500">{c.registered ?? 0} რეგისტრ.</span>
                      <button type="button" onClick={() => toggleMembers(c)} className="text-xs text-gray-500 hover:text-gray-700">
                        {isOpen ? "▾" : "▸"} წევრები
                      </button>
                      {!closed && !synthetic && (
                        <button type="button" disabled={busyCode === c.code} onClick={() => closeDoor(c)} className="text-xs text-red-600 hover:text-red-700 disabled:opacity-50">
                          დახურვა
                        </button>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-gray-100 px-5 py-3">
                      {mErr ? (
                        <p className="text-xs text-red-600">{mErr}</p>
                      ) : !ms ? (
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F] inline-block" />
                      ) : ms.length === 0 ? (
                        <p className="text-xs text-gray-400">წევრი ჯერ არ არის</p>
                      ) : (
                        <table className="w-full text-left text-xs">
                          <thead><tr className="text-gray-400">
                            <th className="py-1 pr-4 font-semibold">დღე</th>
                            <th className="py-1 pr-4 font-semibold">სახელი</th>
                            <th className="py-1 pr-4 font-semibold">სტატუსი</th>
                            <th className="py-1 font-semibold">ტრიალის დასასრული</th>
                          </tr></thead>
                          <tbody>
                            {ms.map((m, i) => (
                              <tr key={i} className="text-gray-600">
                                <td className="py-1 pr-4">{m.day ?? "—"}</td>
                                <td className="py-1 pr-4">{m.name ?? "—"}</td>
                                <td className="py-1 pr-4">{m.status ?? "—"}</td>
                                <td className="py-1">{fmtDate(m.trial_ends_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
