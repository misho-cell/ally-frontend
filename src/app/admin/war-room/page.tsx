"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { fmtRelative } from "@/lib/date";

// #7591 WAR ROOM, step 3 (founder, 23 Oct). Netai finds the people the team
// should act on (the server builds the cards on every GET); the founder reads
// each brief and leaves an instruction, or holds or drops the card. Drafts
// and sending (steps 5-6) come later and only add fields to the card.

type Kind = "new_joiner" | "unanswered_reply" | "stuck_goal" | "tech_error";
type Status = "new" | "instructed" | "drafted" | "approved" | "sent" | "held" | "dropped";

type Card = {
  id: number;
  user_id: number;
  kind: Kind;
  thread_id: number | null;
  task_id: number | null;
  brief: { who: string; their_words: string | null; netai_did: string | null; stalled: string };
  status: Status;
  instruction: string | null;
  instruction_by: string | null;
  instruction_at: string | null;
  created_at: string;
  updated_at: string;
};

type UserThread = {
  id: number;
  type: string;
  status: string;
  title: string | null;
  updated_at: string;
  last_line: string | null;
};

const KIND_LABEL: Record<Kind, string> = {
  new_joiner: "ახალი წევრი",
  unanswered_reply: "უპასუხოდ დარჩა",
  stuck_goal: "გაჩერებული მიზანი",
  tech_error: "ტექნიკური შეცდომა",
};

const STATUS_LABEL: Record<Status, string> = {
  new: "ახალი",
  instructed: "მითითებით",
  drafted: "მონახაზი",
  approved: "დამტკიცებული",
  sent: "გაგზავნილი",
  held: "შეჩერებული",
  dropped: "მოხსნილი",
};

const FILTERS: (Status | "all")[] = ["all", "new", "instructed", "held", "dropped"];

const MAX_INSTRUCTION = 2000;

function errText(err: unknown): string {
  return err instanceof ApiError ? err.message : "შენახვა ვერ მოხერხდა";
}

function UserThreads({ userId }: { userId: number }) {
  // null = loading; a failed load is said as such, never as "no conversations".
  const [threads, setThreads] = useState<UserThread[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    apiFetch<{ data: UserThread[] }>(`/admin/users/${userId}/threads`, { admin: true })
      .then((res) => { if (alive) setThreads(res.data ?? []); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [userId]);

  if (failed) return <p className="text-xs text-red-600">საუბრების ჩატვირთვა ვერ მოხერხდა</p>;
  if (threads === null) {
    return <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />;
  }
  if (threads.length === 0) return <p className="text-xs text-gray-400">საუბარი არ არის</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {threads.map((t) => (
        <div key={t.id} className="rounded-lg bg-gray-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11px] text-gray-400">#{t.id}</span>
            <span className="truncate text-sm font-medium text-[#23261F]">{t.title || "—"}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-gray-500">{t.status}</span>
            <span className="ml-auto text-[11px] text-gray-400">{fmtRelative(t.updated_at)}</span>
          </div>
          {t.last_line && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{t.last_line}</p>}
        </div>
      ))}
      <Link href={`/admin/users/${userId}`} className="self-start text-xs text-[#3E7A56] hover:underline">
        სრულად წაკითხვა →
      </Link>
    </div>
  );
}

function CardView({ card, onChange }: { card: Card; onChange: (c: Card) => void }) {
  const [draft, setDraft] = useState(card.instruction ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showThreads, setShowThreads] = useState(false);

  async function patch(body: { instruction?: string; status?: Status }) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: Card }>(`/admin/war-room/cards/${card.id}`, {
        method: "PATCH",
        body,
        admin: true,
      });
      onChange(res.data);
    } catch (err) {
      setError(errText(err));
    } finally {
      setSaving(false);
    }
  }

  const trimmed = draft.trim();
  const unchanged = trimmed === (card.instruction ?? "").trim();
  const { brief } = card;

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold text-[#23261F]">{brief.who}</span>
        <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{KIND_LABEL[card.kind] ?? card.kind}</span>
        <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">{STATUS_LABEL[card.status] ?? card.status}</span>
        <span className="ml-auto text-xs text-gray-400">{fmtRelative(card.created_at)}</span>
      </div>

      <dl className="mt-3 flex flex-col gap-2 text-sm">
        {brief.their_words !== null && (
          <div>
            <dt className="text-xs text-gray-400">მისი სიტყვები</dt>
            <dd className="whitespace-pre-wrap text-[#23261F]">{brief.their_words}</dd>
          </div>
        )}
        {brief.netai_did !== null && (
          <div>
            <dt className="text-xs text-gray-400">Netai-ს პასუხი</dt>
            <dd className="whitespace-pre-wrap text-[#23261F]">{brief.netai_did}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs text-gray-400">რა გაჩერდა</dt>
          <dd className="text-[#23261F]">{brief.stalled}</dd>
        </div>
      </dl>

      <button
        type="button"
        onClick={() => setShowThreads((v) => !v)}
        className="mt-3 text-xs font-medium text-[#3E7A56] hover:underline"
      >
        {showThreads ? "საუბრების დამალვა ▾" : "მისი საუბრები ▸"}
      </button>
      {showThreads && <div className="mt-2"><UserThreads userId={card.user_id} /></div>}

      <div className="mt-4 flex flex-col gap-2">
        {card.instruction && card.instruction_at && (
          <p className="text-xs text-gray-400">
            მითითება: {card.instruction_by ?? "—"} · {fmtRelative(card.instruction_at)}
          </p>
        )}
        {/* text-base: a focused field under 16px makes iOS zoom the page. */}
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_INSTRUCTION}
          rows={3}
          placeholder="რა ვუთხრათ ან რა გავაკეთოთ"
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-base outline-none focus:border-[#3E7A56] focus:ring-2 focus:ring-[#3E7A56]/10"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={saving || trimmed.length === 0 || unchanged}
            onClick={() => patch({ instruction: trimmed })}
            className="rounded-xl bg-[#23261F] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            მითითების შენახვა
          </button>
          {card.status !== "held" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => patch({ status: "held" })}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-[#23261F] hover:bg-gray-50 disabled:opacity-40"
            >
              შეჩერება
            </button>
          )}
          {card.status !== "dropped" && (
            <button
              type="button"
              disabled={saving}
              onClick={() => patch({ status: "dropped" })}
              className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-40"
            >
              მოხსნა
            </button>
          )}
          <span className="ml-auto text-[11px] text-gray-300">{draft.length}/{MAX_INSTRUCTION}</span>
        </div>
      </div>
    </div>
  );
}

export default function WarRoomPage() {
  const [filter, setFilter] = useState<Status | "all">("new");
  const [cards, setCards] = useState<Card[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(async (f: Status | "all") => {
    setCards(null);
    setFailed(null);
    try {
      const qs = f === "all" ? "" : `?status=${f}`;
      const res = await apiFetch<{ data: Card[] }>(`/admin/war-room/cards${qs}`, { admin: true });
      setCards(res.data ?? []);
    } catch (err) {
      setFailed(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    }
  }, []);

  useEffect(() => {
    // Fetch-on-mount; the setState calls happen after the await.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(filter);
  }, [filter, load]);

  function replace(c: Card) {
    setCards((prev) => prev?.map((x) => (x.id === c.id ? c : x)) ?? prev);
  }

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 hover:text-gray-600 transition">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">War Room</h1>
        </div>
        <button
          type="button"
          onClick={() => load(filter)}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-[#23261F] hover:bg-gray-50"
        >
          განახლება
        </button>
      </header>

      <div className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-6">
        <div className="inline-flex flex-wrap self-start rounded-xl border border-gray-200 bg-white p-1">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                filter === f ? "bg-[#23261F] text-white" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {f === "all" ? "ყველა" : STATUS_LABEL[f]}
            </button>
          ))}
        </div>

        {failed ? (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-10 text-center">
            <p className="text-sm text-gray-500">ბარათების ჩატვირთვა ვერ მოხერხდა</p>
            <p className="text-xs text-gray-400">{failed}</p>
            <button
              type="button"
              onClick={() => load(filter)}
              className="rounded-xl bg-[#23261F] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90"
            >
              ხელახლა ცდა
            </button>
          </div>
        ) : cards === null ? (
          <div className="flex flex-col gap-3">
            {[0, 1, 2].map((i) => <div key={i} className="h-40 animate-pulse rounded-2xl bg-white" />)}
          </div>
        ) : cards.length === 0 ? (
          <p className="py-12 text-center text-sm text-gray-400">ამ სიაში ბარათი არ არის</p>
        ) : (
          cards.map((c) => <CardView key={c.id} card={c} onChange={replace} />)
        )}
      </div>
    </div>
  );
}
