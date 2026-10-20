"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord } from "@/lib/payload";
import { fmtDateTime } from "@/lib/date";

// #6172 (20 Oct): the guest list. Numbers approved ahead of time, by group.
// A listed number passes the invite-only gate, is invited by the group's
// inviter, and gets its free days at its first sign-in, so it never meets
// the payment page until they end. Admin only; the server owns every rule.

type Guest = {
  id: string;
  phone: string;
  group: string | null;
  freeDays: number | null;
  inviterUserId: string | null;
  state: string | null;
  signedInAt: string | null;
  daysLeft: number | null;
};

const STATE_LABEL: Record<string, string> = {
  waiting: "ელოდება",
  active: "აქტიური",
  ended: "დასრულდა",
};

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  if (typeof v === "number") return String(v);
  return typeof v === "string" && v.trim() ? v : null;
}

export default function GuestListPage() {
  const router = useRouter();
  const [group, setGroup] = useState("");
  const [days, setDays] = useState(20);
  const [inviter, setInviter] = useState("");
  const [phones, setPhones] = useState("");
  const [adding, setAdding] = useState(false);
  const [addResult, setAddResult] = useState<{ ok: boolean; text: string } | null>(null);

  const [viewGroup, setViewGroup] = useState("");
  const [shownGroup, setShownGroup] = useState<string | null>(null);
  // null = not loaded; an error is said, never shown as an empty list.
  const [guests, setGuests] = useState<Guest[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [groupDays, setGroupDays] = useState("");
  const [rowDays, setRowDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionResult, setActionResult] = useState<{ ok: boolean; text: string } | null>(null);

  const failText = useCallback((err: unknown): string => {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      router.replace("/admin/login");
    }
    return err instanceof ApiError && err.message ? err.message : "მოქმედება ვერ შესრულდა";
  }, [router]);

  const load = useCallback((g: string) => {
    setListError(null);
    return apiFetch<unknown>(`/admin/guest-list?group=${encodeURIComponent(g)}`, { admin: true })
      .then((res) => {
        const rows = recordItems(pickArray(unwrapData(res), ["guests"])).map((r): Guest => ({
          id: str(r.id) ?? "",
          phone: str(r.phone) ?? "?",
          group: str(r.group),
          freeDays: num(r.free_days),
          inviterUserId: str(r.inviter_user_id),
          state: str(r.state),
          signedInAt: str(r.signed_in_at),
          daysLeft: num(r.days_left),
        }));
        setGuests(rows);
        setShownGroup(g);
      })
      .catch((err) => {
        setGuests(null);
        setShownGroup(g);
        setListError(failText(err));
      });
  }, [failText]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const g = group.trim();
    const inv = Number(inviter);
    // The server takes a blank inviter, but every group has one in the
    // founder's spec; without it the referral chain stays silently empty.
    if (!g || !phones.trim() || !inviter.trim() || !Number.isInteger(inv) || inv <= 0 || adding) return;
    setAdding(true);
    setAddResult(null);
    try {
      const res = await apiFetch<unknown>("/admin/guest-list", {
        admin: true,
        method: "POST",
        body: {
          group: g,
          days,
          inviter_user_id: inv,
          // One pasted text: the server splits it by line or comma.
          phones: phones.trim(),
        },
      });
      const d = unwrapData(res);
      const added = isRecord(d) ? num(d.added) : null;
      const invalid = isRecord(d) ? num(d.invalid) : null;
      setAddResult({ ok: true, text: `დაემატა: ${added ?? "?"}${invalid ? `, არასწორი: ${invalid}` : ""}` });
      setPhones("");
      setViewGroup(g);
      await load(g);
    } catch (err) {
      setAddResult({ ok: false, text: failText(err) });
    } finally {
      setAdding(false);
    }
  }

  async function setDaysFor(path: string, value: string, key: string) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 1 || n > 90 || busy) return;
    setBusy(key);
    setActionResult(null);
    try {
      await apiFetch<unknown>(path, { admin: true, method: "PATCH", body: { days: Math.trunc(n) } });
      setActionResult({ ok: true, text: "შენახულია" });
      if (shownGroup) await load(shownGroup);
    } catch (err) {
      setActionResult({ ok: false, text: failText(err) });
    } finally {
      setBusy(null);
    }
  }

  const input = "rounded-xl border border-gray-200 px-3 py-2 text-base text-[#23261F]";
  const button = "rounded-xl bg-[#23261F] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40";

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
        <h1 className="text-lg font-bold text-[#23261F]">სტუმრების სია</h1>
      </header>

      <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <form onSubmit={add} className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">ნომრების დამატება</h2>
          <div className="flex flex-wrap gap-2">
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              ჯგუფი
              <input value={group} onChange={(e) => setGroup(e.target.value)} className={`${input} w-40`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              დღეები (1–90)
              <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Number(e.target.value) || 0)} className={`${input} w-28`} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              მომწვევის ID
              <input inputMode="numeric" required value={inviter} onChange={(e) => setInviter(e.target.value)} className={`${input} w-32`} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            ნომრები (თითო ხაზზე ერთი, 500-მდე)
            <textarea value={phones} onChange={(e) => setPhones(e.target.value)} rows={6} className={`${input} font-mono`} />
          </label>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={adding || !group.trim() || !phones.trim() || !/^\d+$/.test(inviter.trim()) || Number(inviter) <= 0 || days < 1 || days > 90} className={button}>
              {adding ? "…" : "დამატება"}
            </button>
            {addResult && (
              <span role="status" className={`text-sm ${addResult.ok ? "text-green-700" : "text-red-600"}`}>{addResult.text}</span>
            )}
          </div>
        </form>

        <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <form
            onSubmit={(e) => { e.preventDefault(); if (viewGroup.trim()) void load(viewGroup.trim()); }}
            className="flex flex-wrap items-end gap-2"
          >
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              ჯგუფი
              <input value={viewGroup} onChange={(e) => setViewGroup(e.target.value)} className={`${input} w-40`} />
            </label>
            <button type="submit" disabled={!viewGroup.trim()} className={button}>ჩვენება</button>
          </form>

          {shownGroup && (
            <>
              <div className="flex flex-wrap items-end gap-2 border-t border-gray-100 pt-3">
                <label className="flex flex-col gap-1 text-xs text-gray-500">
                  მთელი ჯგუფის დღეები
                  <input type="number" min={1} max={90} value={groupDays} onChange={(e) => setGroupDays(e.target.value)} className={`${input} w-28`} />
                </label>
                <button
                  type="button"
                  disabled={!groupDays || busy !== null}
                  onClick={() => setDaysFor(`/admin/guest-list/groups/${encodeURIComponent(shownGroup)}`, groupDays, "group")}
                  className={button}
                >
                  {busy === "group" ? "…" : "შენახვა"}
                </button>
                {actionResult && (
                  <span role="status" className={`text-sm ${actionResult.ok ? "text-green-700" : "text-red-600"}`}>{actionResult.text}</span>
                )}
              </div>

              {listError ? (
                <p className="text-sm text-red-600">{listError}</p>
              ) : !guests ? (
                <p className="text-sm text-gray-400">…</p>
              ) : guests.length === 0 ? (
                <p className="text-sm text-gray-400">ამ ჯგუფში ნომერი არ არის</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="text-xs text-gray-400">
                      <tr>
                        <th className="py-1 pr-3 font-medium">ნომერი</th>
                        <th className="py-1 pr-3 font-medium">მდგომარეობა</th>
                        <th className="py-1 pr-3 font-medium">დღეები</th>
                        <th className="py-1 pr-3 font-medium">დარჩა</th>
                        <th className="py-1 pr-3 font-medium">პირველი შესვლა</th>
                        <th className="py-1 font-medium" />
                      </tr>
                    </thead>
                    <tbody>
                      {guests.map((g) => (
                        <tr key={g.id || g.phone} className="border-t border-gray-100">
                          <td className="py-1.5 pr-3 font-mono text-[#23261F]">{g.phone}</td>
                          <td className="py-1.5 pr-3">{g.state ? STATE_LABEL[g.state] ?? g.state : "?"}</td>
                          <td className="py-1.5 pr-3">{g.freeDays ?? "?"}</td>
                          <td className="py-1.5 pr-3">{g.daysLeft ?? "—"}</td>
                          <td className="py-1.5 pr-3 text-xs text-gray-500">{g.signedInAt ? fmtDateTime(g.signedInAt) : "—"}</td>
                          <td className="py-1.5">
                            {g.id && g.state !== "ended" && (
                              <span className="flex items-center gap-1">
                                <input
                                  type="number"
                                  min={1}
                                  max={90}
                                  value={rowDays[g.id] ?? ""}
                                  onChange={(e) => setRowDays((p) => ({ ...p, [g.id]: e.target.value }))}
                                  className="w-16 rounded-lg border border-gray-200 px-2 py-1 text-base"
                                  aria-label="დღეები"
                                />
                                <button
                                  type="button"
                                  disabled={!rowDays[g.id] || busy !== null}
                                  onClick={() => setDaysFor(`/admin/guest-list/${encodeURIComponent(g.id)}`, rowDays[g.id] ?? "", g.id)}
                                  className="rounded-lg border border-gray-200 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                >
                                  {busy === g.id ? "…" : "შენახვა"}
                                </button>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
