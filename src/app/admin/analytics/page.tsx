"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { authHeaders } from "@/lib/deviceId";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type DayCount = { day: string; count: number };

type Overview = {
  growth: { totalUsers: number; newUsersByDay: DayCount[] };
  retention: { dau: number; wau: number; mau: number; activeUsersByDay: DayCount[] };
  funnel: { steps: { step: string; users: number }[] };
  usage: {
    searchesByType: { label: string; count: number }[];
    totalSearches: number;
    introsByStatus: { label: string; count: number }[];
    avgNetworkSize: number;
    factsCount: number;
    insightsCount: number;
  };
};

const FUNNEL_LABELS: Record<string, string> = {
  signed_up: "დარეგისტრირდა",
  imported_contacts: "კონტაქტები აიტვირთა",
  searched: "მოძებნა",
  requested_intro: "გაცნობა მოითხოვა",
  subscribed: "გამოიწერა",
};

const SEARCH_LABELS: Record<string, string> = {
  name: "სახელით",
  tag: "თეგით",
  insight: "ინსაითით",
  second_degree: "მეორე დონის",
  unknown: "უცნობი / ძველი",
};

const INTRO_LABELS: Record<string, string> = {
  pending: "მოლოდინში",
  accepted: "დადასტურებული",
  declined: "უარყოფილი",
};

const ACCENT = "#1a1a2e";

// Fill missing days with 0 so charts show a continuous 30-day axis. Backend
// omits zero days. Uses local date keys (YYYY-MM-DD).
function fillDays(data: DayCount[], days = 30): DayCount[] {
  const map = new Map(data.map((d) => [d.day, d.count]));
  const out: DayCount[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    out.push({ day: key, count: map.get(key) ?? 0 });
  }
  return out;
}

function fmtShort(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}.${m}`;
}

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${BASE_URL}/admin/analytics/overview`, {
        headers: authHeaders(),
      });
      // Valid token but not admin (403) or missing/expired (401) — back to admin login.
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false || !json.data) {
        setError(true);
        return;
      }
      setData(json.data as Overview);
    } catch {
      // network/offline — show retry, do not redirect
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#1a1a2e]">რეპორტინგი</h1>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50 disabled:opacity-50"
        >
          {loading ? "..." : "განახლება"}
        </button>
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-6">
        {loading ? (
          <SkeletonBlocks />
        ) : error ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-gray-500">მონაცემების ჩატვირთვა ვერ მოხერხდა</p>
            <button
              type="button"
              onClick={load}
              className="rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
            >
              ხელახლა ცდა
            </button>
          </div>
        ) : data ? (
          <>
            <GrowthBlock growth={data.growth} />
            <RetentionBlock retention={data.retention} />
            <FunnelBlock steps={data.funnel.steps} />
            <UsageBlock usage={data.usage} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Block 1: Growth ---------- */

function GrowthBlock({ growth }: { growth: Overview["growth"] }) {
  const filled = fillDays(growth.newUsersByDay);
  const total30 = growth.newUsersByDay.reduce((s, d) => s + d.count, 0);

  return (
    <Card title="ზრდა">
      <div className="flex flex-col gap-5">
        <Kpi value={growth.totalUsers} label="სულ მომხმარებელი" big />
        <div>
          <p className="mb-2 text-xs text-gray-500">
            ბოლო 30 დღეში: <span className="font-semibold text-gray-700">{total30}</span> ახალი მომხმარებელი
          </p>
          {growth.newUsersByDay.length === 0 ? (
            <EmptyChart />
          ) : (
            <BarChart data={filled} />
          )}
        </div>
      </div>
    </Card>
  );
}

/* ---------- Block 2: Retention ---------- */

function RetentionBlock({ retention }: { retention: Overview["retention"] }) {
  const filled = fillDays(retention.activeUsersByDay);
  const stickiness = retention.mau > 0 ? Math.round((retention.dau / retention.mau) * 100) : null;

  return (
    <Card title="აქტივობა">
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-3 gap-3">
          <Kpi value={retention.dau} label="დღიური (DAU)" />
          <Kpi value={retention.wau} label="კვირის (WAU)" />
          <Kpi value={retention.mau} label="თვის (MAU)" />
        </div>
        {stickiness !== null && (
          <p className="text-xs text-gray-500">
            Stickiness (DAU/MAU): <span className="font-semibold text-gray-700">{stickiness}%</span>
          </p>
        )}
        {retention.activeUsersByDay.length === 0 ? (
          <EmptyChart />
        ) : (
          <LineChart data={filled} />
        )}
      </div>
    </Card>
  );
}

/* ---------- Block 3: Funnel ---------- */

function FunnelBlock({ steps }: { steps: { step: string; users: number }[] }) {
  const max = steps.length > 0 ? steps[0].users : 0;

  return (
    <Card title="აქტივაციის ძაბრი">
      {steps.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="flex flex-col gap-3">
          {steps.map((s, i) => {
            const prev = i > 0 ? steps[i - 1].users : null;
            const convPct = prev && prev > 0 ? Math.round((s.users / prev) * 100) : null;
            const overallPct = max > 0 ? Math.round((s.users / max) * 100) : 0;
            const width = max > 0 ? Math.max(4, (s.users / max) * 100) : 0;
            return (
              <div key={s.step} className="flex flex-col gap-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{FUNNEL_LABELS[s.step] ?? s.step}</span>
                  <span className="text-gray-500">
                    <span className="font-semibold text-[#1a1a2e]">{s.users}</span>
                    {i > 0 && (
                      <span className="ml-2 text-xs">
                        {convPct === null ? "—" : `${convPct}%`}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-7 w-full overflow-hidden rounded-lg bg-gray-100">
                  <div
                    className="h-full rounded-lg"
                    style={{ width: `${width}%`, background: ACCENT, transition: "width 0.4s" }}
                  />
                </div>
                {i > 0 && (
                  <span className="text-[11px] text-gray-400">{overallPct}% სულ დარეგისტრირებულიდან</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

/* ---------- Block 4: Usage ---------- */

function UsageBlock({ usage }: { usage: Overview["usage"] }) {
  return (
    <Card title="ძირითადი გამოყენება">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Searches by type */}
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-gray-700">ძებნა ტიპის მიხედვით</h3>
            <span className="text-xs text-gray-400">სულ: {usage.totalSearches}</span>
          </div>
          {usage.searchesByType.length === 0 ? (
            <EmptyChart />
          ) : (
            <HBars
              items={usage.searchesByType.map((s) => ({
                label: SEARCH_LABELS[s.label] ?? s.label,
                count: s.count,
              }))}
            />
          )}
        </div>

        {/* Intros by status */}
        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-gray-700">გაცნობის მოთხოვნები სტატუსით</h3>
          {usage.introsByStatus.length === 0 ? (
            <EmptyChart />
          ) : (
            <HBars
              items={usage.introsByStatus.map((s) => ({
                label: INTRO_LABELS[s.label] ?? s.label,
                count: s.count,
              }))}
            />
          )}
        </div>

        {/* Avg network size */}
        <Kpi value={usage.avgNetworkSize} label="საშ. კონტაქტი / მომხმარებელზე" />

        {/* Content counts */}
        <div className="grid grid-cols-2 gap-3">
          <Kpi value={usage.factsCount} label="ფაქტები" />
          <Kpi value={usage.insightsCount} label="ინსაითები" />
        </div>
      </div>
    </Card>
  );
}

/* ---------- Shared UI ---------- */

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-500">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ value, label, big }: { value: number; label: string; big?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className={`font-bold text-[#1a1a2e] ${big ? "text-4xl" : "text-2xl"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}

function EmptyChart() {
  return (
    <div className="flex h-24 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">
      მონაცემი ჯერ არ არის
    </div>
  );
}

// Vertical bar chart (new users per day). Fixed viewBox, scales to width.
function BarChart({ data }: { data: DayCount[] }) {
  const W = 320;
  const H = 90;
  const max = Math.max(1, ...data.map((d) => d.count));
  const gap = 1;
  const barW = W / data.length - gap;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 90 }}>
        {data.map((d, i) => {
          const h = (d.count / max) * (H - 4);
          return (
            <rect
              key={d.day}
              x={i * (barW + gap)}
              y={H - h}
              width={barW}
              height={h}
              rx={1}
              fill={ACCENT}
              opacity={0.85}
            >
              <title>{`${d.day}: ${d.count}`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{fmtShort(data[0].day)}</span>
        <span>{fmtShort(data[data.length - 1].day)}</span>
      </div>
    </div>
  );
}

// Line chart (active users per day).
function LineChart({ data }: { data: DayCount[] }) {
  const W = 320;
  const H = 90;
  const max = Math.max(1, ...data.map((d) => d.count));
  const n = data.length;
  const pts = data.map((d, i) => {
    const x = n === 1 ? W / 2 : (i / (n - 1)) * W;
    const y = H - (d.count / max) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPath = `M0,${H} L${pts.join(" L")} L${W},${H} Z`;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 90 }}>
        <path d={areaPath} fill={ACCENT} opacity={0.08} />
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={ACCENT}
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400">
        <span>{fmtShort(data[0].day)}</span>
        <span>{fmtShort(data[data.length - 1].day)}</span>
      </div>
    </div>
  );
}

// Horizontal bars for categorical breakdowns.
function HBars({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-gray-600">{it.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
            <div
              className="h-full rounded"
              style={{ width: `${Math.max(2, (it.count / max) * 100)}%`, background: ACCENT, opacity: 0.85 }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray-700">{it.count}</span>
        </div>
      ))}
    </div>
  );
}

function SkeletonBlocks() {
  return (
    <>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-4 h-3 w-32 animate-pulse rounded bg-gray-200" />
          <div className="h-24 w-full animate-pulse rounded-xl bg-gray-100" />
        </div>
      ))}
    </>
  );
}
