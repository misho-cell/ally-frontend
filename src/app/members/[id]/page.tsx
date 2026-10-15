"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import SheetPage from "@/components/SheetPage";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray } from "@/lib/payload";

// Task 389, the member card (backend 10 Oct 17:16Z, GET /members/:id). What
// the member themselves show: role and company, city, their areas, and what
// they said they are open to. A hidden or never-filled field is simply not
// drawn. Reached from a contact who is on Netai, and from a person in the
// middle of a path map.
//
// 15 Oct (4621, backend 0317, Misho's yes): „გაცნობის თხოვნა" asks the first
// friend on the best path who uses Netai, the same request the assistant
// makes. The server picks the friend; the card only sends and then opens the
// request's own thread (thread id, never a goal id). Refusals come back as
// codes and are worded here.

const L = {
  en: {
    title: "Member card",
    back: "Back",
    areas: "Areas",
    city: "City",
    openTo: "Open to",
    notFound: "No member found",
    nothing: "Nothing shared yet",
    failed: "Could not load",
    ask: "Request an introduction",
    noBridge: "No friend on Netai leads to this person yet. Inviting someone may help.",
    notSent: "The request was not sent. One may already be waiting for an answer.",
    sendFailed: "Could not send. Try again.",
  },
  ka: {
    title: "წევრის ბარათი",
    back: "უკან",
    areas: "სფეროები",
    city: "ქალაქი",
    openTo: "რისთვის ვარ ღია",
    notFound: "წევრი ვერ მოიძებნა",
    nothing: "ჯერ არაფერი გაუზიარებია",
    failed: "ვერ ჩაიტვირთა",
    ask: "გაცნობის თხოვნა",
    noBridge: "ამ ადამიანამდე Netai-ზე მეგობარი ჯერ არ მიდის. შეიძლება ვინმეს მოწვევა დაგეხმაროს.",
    notSent: "თხოვნა არ გაიგზავნა. შეიძლება ერთი უკვე ელოდება პასუხს.",
    sendFailed: "ვერ გაიგზავნა. სცადე თავიდან.",
  },
};

type Member = { name: string | null; role: string | null; company: string | null; city: string | null; areas: string[]; openTo: string[] };

function parse(raw: unknown): Member | null {
  const d = unwrapData(raw);
  if (!isRecord(d)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const list = (v: unknown) => pickArray(v).filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return { name: str(d.name), role: str(d.role), company: str(d.company), city: str(d.city), areas: list(d.areas), openTo: list(d.open_to) };
}

export default function MemberPage() {
  const s = L[getLocale()];
  const params = useParams();
  const id = String(params.id ?? "");
  const [m, setM] = useState<Member | null | undefined>(undefined);
  const [state, setState] = useState<"ok" | "missing" | "failed">("ok");
  const router = useRouter();
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState<string | null>(null);

  async function askIntro() {
    if (asking) return;
    setAsking(true);
    setAskErr(null);
    try {
      const raw = await apiFetch<unknown>(`/members/${encodeURIComponent(id)}/intro-request`, { method: "POST", body: {} });
      const d = unwrapData(raw);
      const tid = isRecord(d) && (typeof d.thread_id === "number" || typeof d.thread_id === "string") ? String(d.thread_id) : null;
      router.push(tid ? `/chat/${encodeURIComponent(tid)}` : "/chat");
    } catch (e) {
      const code = e instanceof ApiError ? e.message : "";
      setAskErr(
        code === "no_bridge_on_netai" ? s.noBridge
          : code === "not_sent" ? s.notSent
          : e instanceof ApiError && e.status === 429 ? e.message
          : s.sendFailed,
      );
      setAsking(false);
    }
  }

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(`/members/${encodeURIComponent(id)}`)
      .then((raw) => { if (alive) setM(parse(raw)); })
      .catch((e: unknown) => { if (alive) { setM(null); setState(e instanceof ApiError && e.status === 404 ? "missing" : "failed"); } });
    return () => { alive = false; };
  }, [id]);

  const work = m ? [m.role, m.company].filter(Boolean).join(" · ") : "";

  return (
    <SheetPage
      title={s.title}
      backHref="/profile/contacts"
      backLabel={s.back}
    >
      {m === undefined && <span className="sk-bar" style={{ width: "60%" }} />}
      {m === null && (
        <p style={{ font: "400 13px/19px var(--font-system)", color: state === "missing" ? "var(--meta)" : "var(--danger)" }}>
          {state === "missing" ? s.notFound : s.failed}
        </p>
      )}
      {/* 11 Oct (tester, box 53131): a member who filled nothing in drew no
          card at all, which read as a page that failed. Said in words. */}
      {m && !work && !m.city && m.areas.length === 0 && m.openTo.length === 0 && (
        <p className="nx-empty">{s.nothing}</p>
      )}
      {m && (
        <>
          {/* FIXED2 `member`: the square avatar with the name and the work
              beside it. The avatar holds the name's first letter, not
              upper-cased (that turns a Georgian letter into Mtavruli). */}
          <div className="nx-member">
            <span className="nx-avatar" aria-hidden="true">{m.name ? Array.from(m.name.trim())[0] ?? "" : ""}</span>
            <div className="min-w-0">
              {m.name && <b style={{ font: "600 16px/1.35 var(--font-system)", color: "var(--nx-ink)", overflowWrap: "anywhere" }}>{m.name}</b>}
              {work && <p style={{ font: "400 14px/1.65 var(--font-system)", color: "var(--nx-ink)", margin: 0 }}>{work}</p>}
            </div>
          </div>
          {m.city && (
            <div className="nx-row between" style={{ padding: "12px 0", borderBottom: "1px solid var(--nx-line)" }}>
              <span style={{ font: "400 13px/1.4 var(--font-system)", color: "var(--nx-ink)" }}>{s.city}</span>
              <b style={{ font: "600 13px/1.4 var(--font-system)", color: "var(--nx-ink)" }}>{m.city}</b>
            </div>
          )}
          {m.areas.length > 0 && (
            <>
              <h3 className="nx-h3">{s.areas}</h3>
              <div className="nx-tags">
                {m.areas.map((a) => <span key={a} className="nx-pill">{a}</span>)}
              </div>
            </>
          )}
          {m.openTo.length > 0 && (
            <>
              <h3 className="nx-h3">{s.openTo}</h3>
              {m.openTo.map((o, i) => (
                <p key={i} style={{ font: "400 14px/1.65 var(--font-system)", color: "var(--nx-ink)", margin: 0 }}>{o}</p>
              ))}
            </>
          )}
        </>
      )}
      {m && (
        <div className="flex flex-col gap-2" style={{ marginTop: 8 }}>
          <button type="button" className="nx-btn primary self-start" disabled={asking} onClick={askIntro}>
            {asking ? "…" : s.ask}
          </button>
          {askErr && <p role="status" className="nx-note" style={{ color: "var(--danger)" }}>{askErr}</p>}
        </div>
      )}
    </SheetPage>
  );
}
