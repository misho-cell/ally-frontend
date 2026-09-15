"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord } from "@/lib/payload";

// The tester's box (15 Sept). One shared thread inside the admin panel, so
// the tester, the two Claude sessions and Misho can talk to each other
// directly. The tester sits on a different Claude account and cross-account
// session messaging is refused, but admin access is something everyone here
// already has — so this is the room they can all stand in. The point is that
// Misho stops being the wire and gets to be a reader.
//
// Two things this screen must not blur:
//  - WHO WROTE IT. Every message is posted with an admin login, so the
//    identity lives in `author`, not in the session. If the author were left
//    implicit, every line the backend writes would appear under Misho's name.
//    A product must never say a person wrote what a machine wrote, so the
//    author is a coloured badge, not small print.
//  - unread: null is not unread: 0. null means no `reader` was sent, so the
//    question "how many are new" was never asked; 0 means nothing is new.
//
// Refresh is asymmetric and the screen says so rather than implying chat:
// a browser can poll every 10 seconds for nothing, but a Claude session
// cannot be woken more often than hourly.

const POLL_MS = 10_000;
const BODY_MAX = 20_000;
const READER_KEY = "handoff_author";

type Message = {
  id?: number | null;
  author?: string | null;
  body?: string | null;
  created_at?: string | null;
};

// Closed list, deliberately. An unknown value still renders, labelled as
// unknown, rather than being silently dropped or dressed as someone else.
const AUTHORS = ["tester", "misho", "claude_frontend", "claude_backend"] as const;
type Author = (typeof AUTHORS)[number];

const AUTHOR_LABEL: Record<string, string> = {
  tester: "ტესტერი",
  misho: "მიშო",
  claude_frontend: "ფრონტის Claude",
  claude_backend: "ბექის Claude",
};

const AUTHOR_CLS: Record<string, string> = {
  tester: "bg-purple-100 text-purple-800",
  misho: "bg-amber-100 text-amber-900",
  claude_frontend: "bg-blue-100 text-blue-800",
  claude_backend: "bg-green-100 text-green-800",
};

function authorLabel(a?: string | null): string {
  if (!a) return "ავტორი უცნობია";
  return AUTHOR_LABEL[a] ?? a;
}

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // An unreadable value prints raw; the dash means null and only null.
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function isAuthor(v: string): v is Author {
  return (AUTHORS as readonly string[]).includes(v);
}

export default function AdminHandoffPage() {
  const router = useRouter();
  const [me, setMe] = useState<Author | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [latestId, setLatestId] = useState(0);
  const [unread, setUnread] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const latestIdRef = useRef(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(READER_KEY);
      if (saved && isAuthor(saved)) setMe(saved);
    } catch {
      /* private mode — the picker just stays open */
    }
    setLoaded(true);
  }, []);

  const load = useCallback(async (reader: Author | null) => {
    try {
      const params = new URLSearchParams({ limit: "100" });
      // since_id keeps a 10-second poll from re-downloading the whole thread.
      if (latestIdRef.current > 0) params.set("since_id", String(latestIdRef.current));
      if (reader) params.set("reader", reader);
      const res = await apiFetch<unknown>(`/admin/handoff?${params.toString()}`, { admin: true });
      const body = isRecord(unwrapData(res)) ? (unwrapData(res) as Record<string, unknown>) : {};
      const incoming = recordItems(pickArray(body, ["messages"])) as Message[];

      if (incoming.length > 0) {
        setMessages((prev) => {
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...incoming.filter((m) => !seen.has(m.id))];
        });
      }
      if (typeof body.latest_id === "number") {
        latestIdRef.current = body.latest_id;
        setLatestId(body.latest_id);
      }
      setUnread(typeof body.unread === "number" ? body.unread : null);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
    }
  }, [router]);

  useEffect(() => {
    if (!loaded) return;
    load(me);
    const t = setInterval(() => load(me), POLL_MS);
    return () => clearInterval(t);
  }, [loaded, me, load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Marking read is a courtesy to the next reader, never a reason to lose a
  // message: a failure here is swallowed rather than shown as a load error.
  const markRead = useCallback(async (reader: Author, lastSeen: number) => {
    if (lastSeen <= 0) return;
    try {
      await apiFetch("/admin/handoff/read", {
        method: "POST",
        admin: true,
        body: { reader, last_seen_id: lastSeen },
      });
      setUnread(0);
    } catch {
      /* the thread itself is unaffected */
    }
  }, []);

  const send = async () => {
    const text = draft.trim();
    if (!text || !me || sending) return;
    setSending(true);
    setError(null);
    try {
      await apiFetch("/admin/handoff", {
        method: "POST",
        admin: true,
        body: { author: me, body: text },
      });
      setDraft("");
      await load(me);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "გაგზავნა ვერ მოხერხდა");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-full flex-col bg-gray-50">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <a href="/admin" className="text-sm text-gray-400 transition hover:text-gray-600">← ადმინი</a>
        <h1 className="text-lg font-bold text-[#23261F]">ტესტერის ყუთი</h1>
        {/* null means the question was never asked, so it is not a zero. */}
        {unread != null && unread > 0 && (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">
            {unread} ახალი
          </span>
        )}
        {me && latestId > 0 && (
          <button
            type="button"
            onClick={() => markRead(me, latestId)}
            className="text-xs text-gray-400 transition hover:text-gray-600"
          >
            წაკითხულად მონიშვნა
          </button>
        )}
        {me && (
          <button
            type="button"
            onClick={() => { setMe(null); try { localStorage.removeItem(READER_KEY); } catch {} }}
            className="ml-auto text-xs text-gray-400 transition hover:text-gray-600"
          >
            ვინც ვარ, შევცვალო
          </button>
        )}
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-6">
        {/* The screen must not imply a chat. A browser polls every ten
            seconds; a Claude session cannot be woken more often than hourly. */}
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
          ეს ერთი საერთო მიმოწერაა, პირადი ჩატი არ არის. ვინც ადმინკას ხსნის, ყველა შეტყობინებას ხედავს.
          Claude-ის პასუხი შეიძლება საათამდე დაიგვიანოს. ადამიანების მხარე მაშინვე ახლდება.
        </p>

        {!me ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[#23261F]">ვინ ხარ?</h2>
            <p className="mt-1 text-xs text-gray-500">
              ყველა ერთი და იმავე ადმინის შესვლით წერს, ამიტომ სახელს შენ ირჩევ. აირჩიე ის, ვინც ნამდვილად ხარ:
              შენი სახელით გამოჩნდება ყველაფერი, რასაც დაწერ.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {AUTHORS.map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => { setMe(a); try { localStorage.setItem(READER_KEY, a); } catch {} }}
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition hover:opacity-80 ${AUTHOR_CLS[a]}`}
                >
                  {AUTHOR_LABEL[a]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        <div className="flex flex-1 flex-col gap-3">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-gray-400">ჯერ არაფერია დაწერილი</p>
          ) : (
            messages.map((m, i) => {
              const a = m.author ?? "";
              const mine = me != null && a === me;
              return (
                <div
                  key={m.id ?? i}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${mine ? "border-gray-300" : "border-gray-200"}`}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Author as a badge, never as fine print. */}
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${AUTHOR_CLS[a] ?? "bg-gray-100 text-gray-500"}`}>
                      {authorLabel(m.author)}
                    </span>
                    <span className="ml-auto text-xs text-gray-400">{fmt(m.created_at)}</span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-[#23261F]">{m.body ?? ""}</p>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {me && (
          <div className="sticky bottom-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">წერ როგორც</span>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${AUTHOR_CLS[me]}`}>
                {AUTHOR_LABEL[me]}
              </span>
              <span className="ml-auto text-xs text-gray-400">{draft.length} / {BODY_MAX}</span>
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, BODY_MAX))}
              rows={4}
              placeholder="დაწერე რა ნახე. მთელი ბილეთი ჯდება."
              className="w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#23261F]"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || draft.trim().length === 0}
              className="mt-2 rounded-xl bg-[#23261F] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {sending ? "იგზავნება" : "გაგზავნა"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
