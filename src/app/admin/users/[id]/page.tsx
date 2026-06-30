"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { authHeaders } from "@/lib/deviceId";
import { fmtDate, fmtDateTime, fmtRelative, isFuture } from "@/lib/date";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const ACCENT = "#1a1a2e";

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
const TIMELINE_LABELS: Record<string, string> = {
  signup: "დარეგისტრირდა",
  first_import: "პირველი კონტაქტები აიტვირთა",
  first_search: "პირველი ძებნა",
  first_intro_request: "პირველი გაცნობის მოთხოვნა",
  first_nudge: "პირველი nudge",
  last_active: "ბოლო აქტივობა",
};

type DayCount = { day: string; count: number };

type UserProfile = {
  account: {
    name: string | null; email: string | null; employer: string | null;
    jobPosition: string | null; city: string | null; phones: string[];
    createdAt: string | null; deletedAt: string | null;
    subscriptionTier: string | null; subscriptionStatus: string | null;
    trialEndsAt: string | null; currentPeriodEndsAt: string | null;
    paddleCustomerId: string | null;
  };
  network: {
    contactsCount: number; tagsCount: number; blockedCount: number;
    deceasedCount: number; firstDegree: number | null; secondDegree: number | null;
  };
  activity: {
    threadsCount: number; messageCount: number;
    firstActivityAt: string | null; lastActivityAt: string | null;
    activityByDay: DayCount[];
  };
  searches: {
    totalSearches: number; byType: { label: string; count: number }[];
    flaggedCount: number; successfulSearches: number;
    recent: { query: string; tool: string; resultCount: number | null; flagged: boolean; createdAt: string | null }[];
  };
  outcomes: {
    introRequestsMade: number; introRequestsByStatus: { label: string; count: number }[];
    introRequestsMediated: number; insightsSaved: number; factsSubmitted: number;
  };
  memory: {
    profile: { key: string; value: string; updatedAt: string | null }[];
    privateContext: Array<{ key?: string; value?: string } | string>;
    nudgesSent: number; notificationFrequencyDays: number | null;
    consecutiveNoOpens: number; lastNudgeAt: string | null;
    pausedUntil: string | null; distressUntil: string | null;
  };
  devices: {
    devices: { deviceId: string; userAgent: string; ip: string; requestCount: number; firstSeen: string | null; lastSeen: string | null }[];
    pushSubscriptionsCount: number;
  };
  timeline: { type: string; at: string }[];
};

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

function numOrDash(v: number | null | undefined): string {
  return v === null || v === undefined ? "—" : String(v);
}

export default function AdminUserDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    setNotFound(false);
    try {
      const res = await fetch(`${BASE_URL}/admin/users/${id}`, { headers: authHeaders() });
      if (res.status === 401 || res.status === 403) {
        router.replace("/admin/login");
        return;
      }
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.success === false || !json.data) {
        if (json.success === false) { setNotFound(true); return; }
        setError(true);
        return;
      }
      setData(json.data as UserProfile);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [id, router]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin/users" className="text-sm text-gray-400 hover:text-gray-600 transition">← სია</a>
          <h1 className="text-lg font-bold text-[#1a1a2e]">მომხმარებლის პროფილი</h1>
        </div>
        {!loading && !error && !notFound && (
          <button type="button" onClick={load} className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50">განახლება</button>
        )}
      </header>

      <div className="mx-auto max-w-4xl px-4 py-8 flex flex-col gap-6">
        {loading ? (
          <>{[0,1,2,3].map((i)=>(<div key={i} className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm"><div className="mb-4 h-3 w-32 animate-pulse rounded bg-gray-200" /><div className="h-20 w-full animate-pulse rounded-xl bg-gray-100" /></div>))}</>
        ) : notFound ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center text-sm text-gray-500">მომხმარებელი ვერ მოიძებნა</div>
        ) : error ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-10 flex flex-col items-center gap-4 text-center">
            <p className="text-sm text-gray-500">მონაცემების ჩატვირთვა ვერ მოხერხდა</p>
            <button type="button" onClick={load} className="rounded-xl bg-[#1a1a2e] px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90">ხელახლა ცდა</button>
          </div>
        ) : data ? (
          <>
            <AccountBlock a={data.account} />
            <NetworkBlock n={data.network} />
            <ActivityBlock a={data.activity} />
            <SearchesBlock s={data.searches} />
            <OutcomesBlock o={data.outcomes} />
            <MemoryBlock m={data.memory} />
            <DevicesBlock d={data.devices} />
            <TimelineBlock items={data.timeline} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ---------- Block 1: Account ---------- */
function AccountBlock({ a }: { a: UserProfile["account"] }) {
  return (
    <Card title="ანგარიში">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xl font-bold text-[#1a1a2e]">{a.name ?? "—"}</span>
        <SubBadge status={a.subscriptionStatus} tier={a.subscriptionTier} />
        {a.deletedAt && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-700">წაშლილი</span>}
      </div>
      {a.phones.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {a.phones.map((p) => (
            <span key={p} className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600">{p}</span>
          ))}
        </div>
      )}
      <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <KV k="Email" v={a.email ?? "—"} />
        <KV k="დამსაქმებელი" v={a.employer ?? "—"} />
        <KV k="პოზიცია" v={a.jobPosition ?? "—"} />
        <KV k="ქალაქი" v={a.city ?? "—"} />
        <KV k="რეგისტრაცია" v={fmtDate(a.createdAt)} />
        <KV k="Trial სრულდება" v={fmtDate(a.trialEndsAt)} />
        <KV k="პერიოდი სრულდება" v={fmtDate(a.currentPeriodEndsAt)} />
        <KV k="Paddle Customer" v={a.paddleCustomerId ?? "—"} />
      </div>
    </Card>
  );
}

/* ---------- Block 2: Network ---------- */
function NetworkBlock({ n }: { n: UserProfile["network"] }) {
  return (
    <Card title="ქსელი">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi value={String(n.contactsCount)} label="კონტაქტები" />
        <Kpi value={String(n.tagsCount)} label="თეგები" />
        <Kpi value={String(n.blockedCount)} label="დაბლოკილი" />
        <Kpi value={String(n.deceasedCount)} label="გარდაცვლილი" />
        <Kpi value={numOrDash(n.firstDegree)} label="1-ლი დონე" />
        <Kpi value={numOrDash(n.secondDegree)} label="მე-2 დონე" />
      </div>
    </Card>
  );
}

/* ---------- Block 3: Activity ---------- */
function ActivityBlock({ a }: { a: UserProfile["activity"] }) {
  const filled = fillDays(a.activityByDay);
  return (
    <Card title="აქტივობა">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi value={String(a.threadsCount)} label="სრედები" />
        <Kpi value={String(a.messageCount)} label="მესიჯები" />
        <Kpi value={fmtDate(a.firstActivityAt)} label="პირველი" small />
        <Kpi value={fmtDate(a.lastActivityAt)} label="ბოლო" small />
      </div>
      {a.activityByDay.length === 0 ? <Empty /> : <BarChart data={filled} />}
    </Card>
  );
}

/* ---------- Block 4: Searches ---------- */
function SearchesBlock({ s }: { s: UserProfile["searches"] }) {
  const successPct = s.totalSearches > 0 ? Math.round((s.successfulSearches / s.totalSearches) * 100) : null;
  return (
    <Card title="ძებნები">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi value={String(s.totalSearches)} label="სულ ძებნა" />
        <Kpi value={String(s.successfulSearches)} label="წარმატებული" />
        <Kpi value={successPct === null ? "—" : `${successPct}%`} label="წარმატების %" />
        <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
          <p className={`text-2xl font-bold ${s.flaggedCount > 0 ? "text-red-600" : "text-[#1a1a2e]"}`}>{s.flaggedCount}</p>
          <p className="mt-0.5 text-xs text-gray-500">დაფლაგული</p>
        </div>
      </div>

      {s.byType.length > 0 && (
        <div className="mb-4">
          <HBars items={s.byType.map((b) => ({ label: SEARCH_LABELS[b.label] ?? b.label, count: b.count }))} />
        </div>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">ბოლო ძებნები</h3>
      {s.recent.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col divide-y divide-gray-100">
          {s.recent.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="truncate text-gray-700">{r.query || "—"}</p>
                <p className="text-xs text-gray-400">{SEARCH_LABELS[r.tool] ?? r.tool} · {fmtRelative(r.createdAt)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {r.flagged && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">flagged</span>}
                <span className="text-xs text-gray-500">{r.resultCount === null ? "—" : `${r.resultCount} შდგ.`}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- Block 5: Outcomes ---------- */
function OutcomesBlock({ o }: { o: UserProfile["outcomes"] }) {
  return (
    <Card title="შედეგები">
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi value={String(o.introRequestsMade)} label="გაცნობის მოთხ." />
        <Kpi value={String(o.introRequestsMediated)} label="შუამავლობა" />
        <Kpi value={String(o.insightsSaved)} label="ინსაითები" />
        <Kpi value={String(o.factsSubmitted)} label="ფაქტები" />
      </div>
      {o.introRequestsByStatus.length > 0 ? (
        <HBars items={o.introRequestsByStatus.map((b) => ({ label: INTRO_LABELS[b.label] ?? b.label, count: b.count }))} />
      ) : (
        <Empty />
      )}
    </Card>
  );
}

/* ---------- Block 6: Memory ---------- */
function MemoryBlock({ m }: { m: UserProfile["memory"] }) {
  const [showPrivate, setShowPrivate] = useState(false);
  const distress = isFuture(m.distressUntil);
  const paused = isFuture(m.pausedUntil);
  return (
    <Card title="AI მეხსიერება">
      {(distress || paused) && (
        <div className="mb-4 flex flex-wrap gap-2">
          {distress && <span className="rounded-lg bg-red-100 px-3 py-1.5 text-xs font-bold text-red-700">⚠ distress — ფრთხილად</span>}
          {paused && <span className="rounded-lg bg-orange-100 px-3 py-1.5 text-xs font-semibold text-orange-700">nudge შეჩერებულია</span>}
        </div>
      )}

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">პროფილი</h3>
      {m.profile.length === 0 ? (
        <Empty />
      ) : (
        <div className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {m.profile.map((p) => <KV key={p.key} k={p.key} v={p.value} />)}
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi value={String(m.nudgesSent)} label="nudge გაგზავნილი" />
        <Kpi value={numOrDash(m.notificationFrequencyDays)} label="სიხშირე (დღე)" />
        <Kpi value={String(m.consecutiveNoOpens)} label="ზედიზედ გაუხსნელი" />
      </div>
      <p className="mt-2 text-xs text-gray-400">ბოლო nudge: {fmtRelative(m.lastNudgeAt)}</p>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-amber-800">🔒 კონფიდენციალური კონტექსტი</span>
          <button type="button" onClick={() => setShowPrivate((v) => !v)} className="text-xs font-medium text-amber-700 underline">
            {showPrivate ? "დამალვა" : "გამოაჩინე"}
          </button>
        </div>
        {showPrivate && (
          m.privateContext.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">ჯერ მონაცემი არ არის</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {m.privateContext.map((c, i) => (
                <li key={i} className="text-xs text-gray-700">
                  {typeof c === "string" ? c : `${c.key ?? ""}: ${c.value ?? ""}`}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </Card>
  );
}

/* ---------- Block 7: Devices ---------- */
function DevicesBlock({ d }: { d: UserProfile["devices"] }) {
  return (
    <Card title="მოწყობილობები">
      <p className="mb-3 text-xs text-gray-500">Push გამოწერები: <span className="font-semibold text-gray-700">{d.pushSubscriptionsCount}</span></p>
      {d.devices.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col gap-2">
          {d.devices.map((dev) => (
            <div key={dev.deviceId} className="rounded-xl border border-gray-100 bg-gray-50 p-3 text-xs">
              <p className="truncate font-medium text-gray-700">{dev.userAgent || "—"}</p>
              <p className="mt-1 text-gray-400">IP: {dev.ip || "—"} · {dev.requestCount} მოთხ.</p>
              <p className="text-gray-400">{fmtRelative(dev.firstSeen)} → {fmtRelative(dev.lastSeen)}</p>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/* ---------- Block 8: Timeline ---------- */
function TimelineBlock({ items }: { items: UserProfile["timeline"] }) {
  return (
    <Card title="ქრონოლოგია">
      {items.length === 0 ? (
        <Empty />
      ) : (
        <div className="flex flex-col">
          {items.map((t, i) => (
            <div key={i} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="mt-1 h-2.5 w-2.5 rounded-full" style={{ background: ACCENT }} />
                {i < items.length - 1 && <span className="w-px flex-1 bg-gray-200" />}
              </div>
              <div className="pb-4">
                <p className="text-sm font-medium text-gray-700">{TIMELINE_LABELS[t.type] ?? t.type}</p>
                <p className="text-xs text-gray-400">{fmtDateTime(t.at)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
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
function Kpi({ value, label, small }: { value: string; label: string; small?: boolean }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
      <p className={`font-bold text-[#1a1a2e] ${small ? "text-sm" : "text-2xl"}`}>{value}</p>
      <p className="mt-0.5 text-xs text-gray-500">{label}</p>
    </div>
  );
}
function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-gray-50 py-1 text-sm">
      <span className="text-gray-400">{k}</span>
      <span className="truncate text-right font-medium text-gray-700">{v}</span>
    </div>
  );
}
function Empty() {
  return <div className="flex h-16 items-center justify-center rounded-xl bg-gray-50 text-sm text-gray-400">ჯერ მონაცემი არ არის</div>;
}
function SubBadge({ status, tier }: { status: string | null; tier: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    trialing: { label: "Trial", cls: "bg-blue-100 text-blue-700" },
    active: { label: "აქტიური", cls: "bg-green-100 text-green-700" },
    past_due: { label: "გადახდა", cls: "bg-red-100 text-red-700" },
    canceled: { label: "გაუქმებული", cls: "bg-orange-100 text-orange-700" },
    inactive: { label: "უფასო", cls: "bg-gray-100 text-gray-500" },
  };
  const b = (status && map[status]) || map.inactive;
  const label = tier && status === "active" ? `${tier} · ${b.label}` : b.label;
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${b.cls}`}>{label}</span>;
}
function BarChart({ data }: { data: DayCount[] }) {
  const W = 320, H = 90;
  const max = Math.max(1, ...data.map((d) => d.count));
  const gap = 1;
  const barW = W / data.length - gap;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height: 90 }}>
      {data.map((d, i) => {
        const h = (d.count / max) * (H - 4);
        return <rect key={d.day} x={i * (barW + gap)} y={H - h} width={barW} height={h} rx={1} fill={ACCENT} opacity={0.85}><title>{`${d.day}: ${d.count}`}</title></rect>;
      })}
    </svg>
  );
}
function HBars({ items }: { items: { label: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="w-24 shrink-0 truncate text-xs text-gray-600">{it.label}</span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
            <div className="h-full rounded" style={{ width: `${Math.max(2, (it.count / max) * 100)}%`, background: ACCENT, opacity: 0.85 }} />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-semibold text-gray-700">{it.count}</span>
        </div>
      ))}
    </div>
  );
}
