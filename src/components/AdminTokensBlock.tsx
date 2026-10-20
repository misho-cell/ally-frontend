"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord } from "@/lib/payload";
import { fmtDateTime } from "@/lib/date";

// #6106 (20 Oct, Misho's yes): the team adds or corrects a user's tokens
// from here. Every change carries a reason, and the history below says who
// made it, why and when. A negative amount is a correction.
//
// The server has two routes: one for real accounts, one for fictional seats,
// and each refuses the other kind (400 and 403). The profile does not say
// which kind this is, so the real route is tried first; its 400 sends the
// call to the seat route, and the seat route's 403 means it was a real
// account after all, so the first route's own sentence is the one shown.

type Adjustment = { at: string | null; tokens: number | null; reason: string | null; byAdmin: string | null };
type History = { balance: number | null; adjustments: Adjustment[] };

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}
function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : v != null && typeof v === "number" ? String(v) : null;
}

export default function AdminTokensBlock({ userId }: { userId: string }) {
  const [history, setHistory] = useState<History | null>(null);
  // Absent and failed are different facts: null history with an error says
  // "could not load", not "no changes".
  const [historyError, setHistoryError] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const loadHistory = useCallback(() => {
    return apiFetch<unknown>(`/admin/users/${encodeURIComponent(userId)}/tokens/history?limit=20`, { admin: true })
      .then((res) => {
        const d = unwrapData(res);
        const rows = recordItems(pickArray(d, ["adjustments"])).map((r) => ({
          at: str(r.at),
          tokens: num(r.tokens),
          reason: str(r.reason),
          byAdmin: str(r.by_admin),
        }));
        setHistory({ balance: isRecord(d) ? num(d.balance) : null, adjustments: rows });
        setHistoryError(false);
      })
      .catch(() => setHistoryError(true));
  }, [userId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0 || reason.trim().length < 3 || busy) return;
    setBusy(true);
    setResult(null);
    const body = { amount: Math.trunc(n), reason: reason.trim() };
    const id = encodeURIComponent(userId);
    try {
      let res: unknown;
      try {
        res = await apiFetch<unknown>(`/admin/users/${id}/tokens`, { admin: true, method: "POST", body });
      } catch (first) {
        if (!(first instanceof ApiError) || first.status !== 400) throw first;
        try {
          res = await apiFetch<unknown>(`/admin/test-accounts/${id}/tokens`, { admin: true, method: "POST", body });
        } catch (second) {
          throw second instanceof ApiError && second.status === 403 ? first : second;
        }
      }
      const d = unwrapData(res);
      const balance = isRecord(d) ? num(d.balance) : null;
      setResult({ ok: true, text: balance != null ? `ახალი ბალანსი: ${balance}` : "შენახულია" });
      setAmount("");
      setReason("");
      await loadHistory();
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error && err.message ? err.message : "ვერ შეინახა" });
    } finally {
      setBusy(false);
    }
  }

  const amountN = Number(amount);
  const canSend = Number.isFinite(amountN) && amountN !== 0 && reason.trim().length >= 3 && !busy;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">ტოკენები</h2>
      {/* Misho, 20 Oct: fictional seats only, until he says otherwise for a real account. */}
      <p className="mb-4 text-xs text-gray-400">რეალურ ანგარიშზე მხოლოდ მიშოს თანხმობით.</p>
      <p className="mb-3 text-sm text-gray-700">
        ბალანსი: <strong>{history?.balance != null ? history.balance : historyError ? "ვერ ჩაიტვირთა" : "…"}</strong>
      </p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          რაოდენობა
          <input
            type="number"
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="100 ან -50"
            className="w-32 rounded-xl border border-gray-200 px-3 py-2 text-base text-[#23261F]"
          />
        </label>
        <label className="flex min-w-[12rem] flex-1 flex-col gap-1 text-xs text-gray-500">
          მიზეზი
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="rounded-xl border border-gray-200 px-3 py-2 text-base text-[#23261F]"
          />
        </label>
        <button
          type="submit"
          disabled={!canSend}
          className="rounded-xl bg-[#23261F] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "…" : "შევსება"}
        </button>
      </form>
      {result && (
        <p role="status" className={`mt-2 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.text}</p>
      )}
      <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-gray-400">ისტორია</p>
      {historyError && !history ? (
        <p className="mt-1 text-sm text-red-600">ისტორია ვერ ჩაიტვირთა</p>
      ) : !history ? (
        <p className="mt-1 text-sm text-gray-400">…</p>
      ) : history.adjustments.length === 0 ? (
        <p className="mt-1 text-sm text-gray-400">ჯერ არ არის</p>
      ) : (
        <div className="mt-1 flex flex-col gap-1">
          {history.adjustments.map((a, i) => (
            <div key={i} className="flex flex-wrap items-baseline gap-2 text-sm">
              <span className="text-xs text-gray-400">{a.at ? fmtDateTime(a.at) : "?"}</span>
              <span className={`font-semibold ${a.tokens != null && a.tokens < 0 ? "text-red-600" : "text-[#23261F]"}`}>
                {a.tokens != null ? (a.tokens > 0 ? `+${a.tokens}` : String(a.tokens)) : "?"}
              </span>
              <span className="text-gray-700">{a.reason ?? ""}</span>
              {a.byAdmin && <span className="text-xs text-gray-400">#{a.byAdmin}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
