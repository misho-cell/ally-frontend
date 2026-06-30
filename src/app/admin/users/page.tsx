"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { authHeaders } from "@/lib/deviceId";
import { fmtDate, fmtRelative } from "@/lib/date";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type UserListItem = {
  id: string;
  name: string | null;
  phones: string[];
  city: string | null;
  subscriptionStatus: string | null;
  createdAt: string | null;
  lastActiveAt: string | null;
  contactsCount: number;
};

const SUB_BADGE: Record<string, { label: string; cls: string }> = {
  trialing: { label: "Trial", cls: "bg-blue-100 text-blue-700" },
  active: { label: "აქტიური", cls: "bg-green-100 text-green-700" },
  past_due: { label: "გადახდა", cls: "bg-red-100 text-red-700" },
  canceled: { label: "გაუქმებული", cls: "bg-orange-100 text-orange-700" },
  inactive: { label: "უფასო", cls: "bg-gray-100 text-gray-500" },
};

function SubBadge({ status }: { status: string | null }) {
  const b = (status && SUB_BADGE[status]) || SUB_BADGE.inactive;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{b.label}</span>
  );
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [subscribed, setSubscribed] = useState(true); // default: subscribers only
  const [users, setUsers] = useState<UserListItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(
    async (query: string, subsOnly: boolean) => {
      setLoading(true);
      setError(false);
      try {
        const params = new URLSearchParams({ q: query, limit: "50" });
        if (subsOnly) params.set("subscribed", "true");
        const res = await fetch(`${BASE_URL}/admin/users?${params.toString()}`, {
          headers: authHeaders(),
        });
        if (res.status === 401 || res.status === 403) {
          router.replace("/admin/login");
          return;
        }
        const json = await res.json().catch(() => ({}));
        if (!res.ok || json.success === false) {
          setError(true);
          return;
        }
        setUsers((json.data ?? []) as UserListItem[]);
      } catch {
        setError(true);
      } finally {
        setLoading(false);
      }
    },
    [router]
  );

  // Debounced fetch on q / toggle change (and initial load).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(q, subscribed), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [q, subscribed, load]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#1a1a2e]">მომხმარებლები</h1>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-4">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ძებნა სახელით ან ნომრით..."
          className="w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm outline-none transition-colors focus:border-[#1a1a2e] focus:ring-2 focus:ring-[#1a1a2e]/10"
        />

        {/* Subscribed / all toggle */}
        <div className="inline-flex self-start rounded-xl border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setSubscribed(true)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              subscribed ? "bg-[#1a1a2e] text-white" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            გამომწერები
          </button>
          <button
            type="button"
            onClick={() => setSubscribed(false)}
            className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
              !subscribed ? "bg-[#1a1a2e] text-white" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            ყველა
          </button>
        </div>

        {loading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-16 w-full animate-pulse rounded-xl bg-white" />
            ))}
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-gray-500">მონაცემების ჩატვირთვა ვერ მოხერხდა</p>
            <button
              type="button"
              onClick={() => load(q, subscribed)}
              className="rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              ხელახლა ცდა
            </button>
          </div>
        ) : !users || users.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">
            {subscribed ? "გამომწერი ჯერ არ არის" : "მომხმარებელი ვერ მოიძებნა"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {users.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => router.push(`/admin/users/${u.id}`)}
                className="flex items-center justify-between gap-4 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left transition-colors hover:bg-gray-50"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-[#1a1a2e]">{u.name ?? "—"}</p>
                  <p className="mt-0.5 truncate text-xs text-gray-400">
                    {u.phones[0] ?? "—"}
                    {u.city ? ` · ${u.city}` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <SubBadge status={u.subscriptionStatus} />
                  <span className="text-xs text-gray-400">
                    {u.contactsCount} კონტაქტი · {fmtRelative(u.lastActiveAt)}
                  </span>
                  <span className="text-[11px] text-gray-300">დარეგ.: {fmtDate(u.createdAt)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
