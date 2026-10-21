"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, isRecord } from "@/lib/payload";
import { fmtDateTime } from "@/lib/date";

// Backend 21 Oct 13:35Z (Misho's ask): how many tokens a free trial carries,
// changed here without a deploy. The server owns the number and its limits
// (a whole number, 0 to 20000); its own sentence is shown when it refuses.
// A new number reaches only trials not yet credited.

type Grant = { value: number | null; updatedAt: string | null };

export default function AdminTrialTokensBlock() {
  // null = not loaded yet; a failed load is said, never shown as a number.
  const [grant, setGrant] = useState<Grant | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const read = useCallback((raw: unknown): Grant => {
    const d = unwrapData(raw);
    return {
      value: isRecord(d) && typeof d.value === "number" ? d.value : null,
      updatedAt: isRecord(d) && typeof d.updated_at === "string" ? d.updated_at : null,
    };
  }, []);

  useEffect(() => {
    let live = true;
    apiFetch<unknown>("/admin/token-grants/trial", { admin: true })
      .then((raw) => { if (live) { setGrant(read(raw)); setLoadFailed(false); } })
      .catch(() => { if (live) setLoadFailed(true); });
    return () => { live = false; };
  }, [read]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(input);
    if (!input.trim() || !Number.isInteger(n) || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const raw = await apiFetch<unknown>("/admin/token-grants/trial", { admin: true, method: "PUT", body: { value: n } });
      // The answer is the saved number; draw that, not what was typed.
      setGrant(read(raw));
      setLoadFailed(false);
      setInput("");
      setResult({ ok: true, text: "შენახულია" });
    } catch (err) {
      setResult({ ok: false, text: err instanceof ApiError && err.message ? err.message : "ვერ შეინახა" });
    } finally {
      setBusy(false);
    }
  }

  const n = Number(input);
  const canSave = !!input.trim() && Number.isInteger(n) && n >= 0 && n <= 20000 && !busy;

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-gray-500">საცდელი პერიოდის ტოკენები</h2>
      <p className="mb-4 text-xs text-gray-400">
        ახალ რიცხვს მიიღებს ყველა საცდელი, რომელსაც ტოკენები ჯერ არ მიუღია. ვინც უკვე მიიღო, თავისას ინარჩუნებს. 0 ნიშნავს, რომ საცდელს ტოკენები არ მოყვება.
      </p>
      <p className="mb-3 text-sm text-gray-700">
        ახლა: <strong>{grant?.value != null ? grant.value : loadFailed ? "ვერ ჩაიტვირთა" : "…"}</strong>
        {grant?.updatedAt && <span className="ml-2 text-xs text-gray-400">{fmtDateTime(grant.updatedAt)}</span>}
      </p>
      <form onSubmit={save} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs text-gray-500">
          რაოდენობა (0–20000)
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={20000}
            step={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="w-36 rounded-xl border border-gray-200 px-3 py-2 text-base text-[#23261F]"
          />
        </label>
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-xl bg-[#23261F] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "…" : "შენახვა"}
        </button>
      </form>
      {result && (
        <p role="status" className={`mt-2 text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.text}</p>
      )}
    </section>
  );
}
