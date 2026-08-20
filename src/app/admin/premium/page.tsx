"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { adminAuthHeaders } from "@/lib/deviceId";
import { fmtDate } from "@/lib/date";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// პრემიუმის მართვა (ბექის დავალება, 18 აგვ.):
// GET /admin/users/search?phone=... (ნებისმიერი ფორმატი, მინ. 6 ციფრი)
// POST /admin/users/:id/subscription  { tier, days } ან { action: "deactivate" }
// ტოკენებს ბექი თავისით რიცხავს; აუდიტიც ბექშია.

type FoundUser = {
  id: number;
  name: string | null;
  phone: string;
  subscription_status: string;
  subscription_tier: string;
  current_period_ends_at: string | null;
  created_at: string | null;
};

type PendingAction =
  | { kind: "activate"; user: FoundUser; tier: "pro" | "enterprise"; days: number }
  | { kind: "deactivate"; user: FoundUser };

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  trialing: { label: "Trial", cls: "bg-blue-100 text-blue-700" },
  active: { label: "აქტიური", cls: "bg-green-100 text-green-700" },
  past_due: { label: "გადახდის პრობლემა", cls: "bg-red-100 text-red-700" },
  canceled: { label: "გაუქმებული", cls: "bg-orange-100 text-orange-700" },
  inactive: { label: "inactive", cls: "bg-gray-100 text-gray-500" },
};

function StatusBadge({ status }: { status: string }) {
  const b = STATUS_BADGE[status] ?? STATUS_BADGE.inactive;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>;
}

function digitCount(s: string): number {
  return (s.match(/\d/g) ?? []).length;
}

export default function AdminPremiumPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [results, setResults] = useState<FoundUser[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  // დღეების ველი თითო ბარათზე (id → days).
  const [daysById, setDaysById] = useState<Record<number, string>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showToast(msg: string, ok: boolean) {
    setToast({ msg, ok });
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 2600);
  }

  function daysFor(id: number): number {
    const raw = daysById[id];
    const n = parseInt(raw ?? "", 10);
    if (!Number.isFinite(n)) return 30;
    return Math.min(365, Math.max(1, n));
  }

  async function search() {
    const q = phone.trim();
    if (digitCount(q) < 6) {
      setHint("შეიყვანე მინიმუმ 6 ციფრი");
      return;
    }
    setHint(null);
    setSearching(true);
    try {
      const res = await fetch(`${BASE_URL}/admin/users/search?phone=${encodeURIComponent(q)}`, {
        headers: adminAuthHeaders(),
      });
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (res.status === 400) {
        setHint(json.error ?? "არასწორი ნომერი");
        return;
      }
      if (!res.ok || json.success === false) {
        showToast(json.error ?? "ძებნა ვერ შესრულდა, სცადე თავიდან", false);
        return;
      }
      setResults((json.data ?? []) as FoundUser[]);
    } catch {
      showToast("ქსელის შეცდომა, სცადე თავიდან", false);
    } finally {
      setSearching(false);
    }
  }

  async function runPending() {
    if (!pending || busy) return;
    setBusy(true);
    const { user } = pending;
    const body =
      pending.kind === "activate"
        ? { tier: pending.tier, days: pending.days }
        : { action: "deactivate" };
    try {
      const res = await fetch(`${BASE_URL}/admin/users/${user.id}/subscription`, {
        method: "POST",
        headers: adminAuthHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      });
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (res.status === 404) {
        showToast("მომხმარებელი აღარ არსებობს ან წაშლილია", false);
        setResults((prev) => (prev ? prev.filter((u) => u.id !== user.id) : prev));
        return;
      }
      if (!res.ok || json.success === false) {
        showToast(json.error ?? "მოქმედება ვერ შესრულდა, სცადე თავიდან", false);
        return;
      }
      const updated = (json.data ?? json) as FoundUser;
      // ბარათი ადგილზევე ახლდება სერვერის პასუხიდან.
      setResults((prev) =>
        prev ? prev.map((u) => (u.id === user.id ? { ...u, ...updated } : u)) : prev
      );
      showToast(pending.kind === "activate" ? "✓ ჩართულია" : "✓ გამორთულია", true);
    } catch {
      showToast("ქსელის შეცდომა, სცადე თავიდან", false);
    } finally {
      setBusy(false);
      setPending(null);
    }
  }

  const activeLike = (u: FoundUser) => u.subscription_status === "active" || u.subscription_status === "trialing";

  return (
    <div className="min-h-full bg-gray-50">
      {toast && (
        <div
          className={`fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl px-4 py-2.5 text-sm font-medium shadow-lg ${
            toast.ok ? "bg-[#23261F] text-white" : "bg-red-600 text-white"
          }`}
          role="status"
          aria-live="polite"
        >
          {toast.msg}
        </div>
      )}

      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">მომხმარებლები / პრემიუმი</h1>
        </div>
        <a
          href="/admin/users"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 text-[#23261F] text-sm hover:bg-gray-50 transition"
        >
          სრული სია →
        </a>
      </header>

      <div className="mx-auto max-w-2xl px-4 py-8 flex flex-col gap-4">
        {/* Search */}
        <form
          onSubmit={(e) => { e.preventDefault(); search(); }}
          className="flex gap-2"
        >
          <input
            type="text"
            value={phone}
            onChange={(e) => { setPhone(e.target.value); setHint(null); }}
            placeholder="ტელეფონის ნომერი ნებისმიერი ფორმატით"
            className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10"
          />
          <button
            type="submit"
            disabled={searching}
            className="flex h-12 w-28 items-center justify-center rounded-xl bg-[#23261F] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {searching ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              "ძებნა"
            )}
          </button>
        </form>
        {hint && <p className="-mt-2 text-xs text-red-600">{hint}</p>}

        {/* Results */}
        {results !== null && results.length === 0 && (
          <div className="rounded-2xl border border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-500">
              ამ ნომრით მომხმარებელი ვერ მოიძებნა. შესაძლოა ჯერ არ დარეგისტრირებულა.
            </p>
          </div>
        )}

        {results?.map((u) => (
          <div key={u.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col gap-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="font-semibold text-[#23261F]">{u.name ?? "—"}</p>
                <p className="mt-0.5 text-sm text-gray-500">{u.phone}</p>
              </div>
              <StatusBadge status={u.subscription_status} />
            </div>

            <div className="grid grid-cols-3 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-400">პაკეტი</p>
                <p className="font-medium text-[#23261F]">{u.subscription_tier}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">ვადა</p>
                <p className="font-medium text-[#23261F]">
                  {u.current_period_ends_at ? fmtDate(u.current_period_ends_at) : "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400">დარეგისტრირდა</p>
                <p className="font-medium text-[#23261F]">{u.created_at ? fmtDate(u.created_at) : "—"}</p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-500">
                დღე
                <input
                  type="number"
                  min={1}
                  max={365}
                  value={daysById[u.id] ?? "30"}
                  onChange={(e) => setDaysById((prev) => ({ ...prev, [u.id]: e.target.value }))}
                  className="w-20 rounded-lg border border-gray-200 px-2 py-1.5 text-sm outline-none focus:border-[#3E7A56]"
                />
              </label>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending({ kind: "activate", user: u, tier: "pro", days: daysFor(u.id) })}
                className="rounded-xl bg-[#23261F] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                Pro-ს ჩართვა
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending({ kind: "activate", user: u, tier: "enterprise", days: daysFor(u.id) })}
                className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-semibold text-[#23261F] transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                Enterprise-ის ჩართვა
              </button>
              {activeLike(u) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setPending({ kind: "deactivate", user: u })}
                  className="ml-auto rounded-xl border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-60"
                >
                  გამორთვა
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm modal (design-system style, not window.confirm) */}
      {pending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-4"
          style={{ background: "rgba(18,21,16,0.32)" }}
          onClick={() => !busy && setPending(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl flex flex-col gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-[#23261F]">
              {pending.kind === "activate"
                ? `ჩავრთო ${pending.tier === "pro" ? "Pro" : "Enterprise"} ${pending.days} დღით — ${pending.user.name ?? "—"} (${pending.user.phone})?`
                : `გავთიშო პრემიუმი ახლავე — ${pending.user.name ?? "—"} (${pending.user.phone})?`}
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
              >
                გაუქმება
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={runPending}
                className={`flex w-32 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60 ${
                  pending.kind === "deactivate" ? "bg-red-600" : "bg-[#23261F]"
                }`}
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                ) : (
                  "დადასტურება"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
