"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import SheetPage from "@/components/SheetPage";
import PathMap from "@/components/PathMap";
import ConfirmDialog from "@/components/ConfirmDialog";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale, fmtDateShort } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 10 Oct, a contact's page (design 4.8), on GET /contacts/:id (backend
// 11:10Z). Everything on it is what THIS person saved: their labels, how
// close they marked the tie, their facts, the goals they kept this contact
// out of. Nothing anybody else saved is ever shown, and the contact's own
// topic boundary is deliberately absent (D421): the person asking is never
// told one exists.
//
// 14 Oct (backend 0301, Misho's list): the owner's own facts can be added,
// corrected and forgotten, a goal exclusion can be lifted, and the contact
// can be removed or marked deceased. Every write is by the id the server
// gave, never by matching text.
//
// 15 Oct (backend 0318, Misho's yes): the owner sets the warmth by hand
// (pressing the chosen one again hands it back to Netai's own reading), adds
// and removes labels of their own (the phonebook's stay as they are), and
// keeps the contact out of one of their goals, picked by goal id.
//
// 12:15Z (D773): also what is public about the person, each fact with its
// source and date when the server has them. Public, not saved by another
// member: the server never puts a member's saving there. Kept in its own
// card so it never reads as the person's own facts.

const L = {
  en: {
    back: "Back to contacts",
    close: "Close",
    onNetai: "On Netai",
    note: "Your labels, facts and relationships appear here, and public information with its source. Information saved by others is never shown.",
    publicFacts: "Public information",
    source: "Source",
    labels: "My labels",
    facts: "My facts",
    noFacts: "No saved facts.",
    excluded: "Kept out of",
    warmth: { warm: "Warm connection", neutral: "Neutral connection", distant: "Distant connection" },
    memberCard: "Member card",
    notFound: "No contacts found",
    failed: "Could not load",
    addFact: "Add a fact",
    factPlaceholder: "Write in your own words",
    save: "Save",
    cancel: "Cancel",
    edit: "Correct",
    forget: "Forget",
    lift: "Remove",
    removeContact: "Remove contact",
    removeAsk: "Remove this contact?",
    deceased: "Deceased",
    deceasedAsk: "Mark as deceased?",
    saveFailed: "Could not save. Try again.",
    warmthTitle: "Connection warmth",
    labelPlaceholder: "New label",
    add: "Add",
    excludeGoal: "Exclude for a goal",
    noGoals: "No goals to choose from.",
  },
  ka: {
    back: "კონტაქტებში დაბრუნება",
    close: "დახურვა",
    onNetai: "Netai-ზეა",
    note: "აქ ჩანს შენი იარლიყები, ფაქტები და ურთიერთობები, და საჯარო ინფორმაცია წყაროსთან ერთად. სხვების შენახული ინფორმაცია არასოდეს გამოჩნდება.",
    publicFacts: "საჯარო ინფორმაცია",
    source: "წყარო",
    labels: "ჩემი იარლიყები",
    facts: "ჩემი ფაქტები",
    noFacts: "შენახული ფაქტები არ არის.",
    excluded: "გამორიცხულია",
    warmth: { warm: "თბილი კავშირი", neutral: "ნეიტრალური კავშირი", distant: "დისტანციური კავშირი" },
    memberCard: "წევრის ბარათი",
    notFound: "კონტაქტი ვერ მოიძებნა",
    failed: "ვერ ჩაიტვირთა",
    addFact: "ფაქტის დამატება",
    factPlaceholder: "ჩაწერე შენი სიტყვებით",
    save: "შენახვა",
    cancel: "გაუქმება",
    edit: "გასწორება",
    forget: "დავიწყება",
    lift: "მოხსნა",
    removeContact: "კონტაქტის ამოღება",
    removeAsk: "ამოვიღოთ კონტაქტი?",
    deceased: "გარდაცვლილი",
    deceasedAsk: "მოვნიშნოთ გარდაცვლილად?",
    saveFailed: "ვერ შეინახა. სცადე თავიდან.",
    warmthTitle: "კავშირის სითბო",
    labelPlaceholder: "ახალი იარლიყი",
    add: "დამატება",
    excludeGoal: "მიზნისთვის გამორიცხვა",
    noGoals: "ასარჩევი მიზანი არ არის.",
  },
};

type Contact = {
  name: string | null;
  role: string | null;
  onNetai: boolean;
  labels: string[];
  ownLabels: string[];
  warmth: "warm" | "neutral" | "distant" | null;
  facts: Fact[];
  publicFacts: { value: string; sourceUrl: string | null; date: string | null }[];
  exclusions: { id: string | null; text: string }[];
};

// The fact's id is what every write names; a fact the server sent without
// one is shown but cannot be edited (an older server, before 0301).
type Fact = { id: string | null; value: string };

const idOf = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : typeof v === "number" ? String(v) : null);

function parseFacts(list: unknown): Fact[] {
  return recordItems(pickArray(list)).flatMap((f) => (typeof f.value === "string" && f.value.trim() ? [{ id: idOf(f.id), value: f.value }] : []));
}

function parse(raw: unknown): Contact | null {
  const d = unwrapData(raw);
  if (!isRecord(d)) return null;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return {
    // 16:40Z (4390): a symbol-only contact has no name but keeps its label.
    name: str(d.name) ?? str(d.saved_as),
    role: str(d.role),
    onNetai: d.on_netai === true,
    labels: pickArray(d.labels).filter((l): l is string => typeof l === "string" && l.trim() !== ""),
    ownLabels: pickArray(d.own_labels).filter((l): l is string => typeof l === "string" && l.trim() !== ""),
    warmth: d.warmth === "warm" || d.warmth === "neutral" || d.warmth === "distant" ? d.warmth : null,
    facts: parseFacts(d.facts),
    publicFacts: recordItems(pickArray(d.public_facts)).flatMap((f) => (typeof f.value === "string" && f.value.trim()
      ? [{ value: f.value, sourceUrl: typeof f.source_url === "string" && /^https?:\/\//.test(f.source_url) ? f.source_url : null, date: str(f.fact_date) }]
      : [])),
    exclusions: recordItems(pickArray(d.exclusions)).flatMap((e) => (typeof e.excluded_for === "string" && e.excluded_for.trim() ? [{ id: idOf(e.id), text: e.excluded_for }] : [])),
  };
}

export default function ContactPage() {
  const s = L[getLocale()];
  const params = useParams();
  const router = useRouter();
  const id = String(params.id ?? "");
  const [c, setC] = useState<Contact | null | undefined>(undefined);
  const [state, setState] = useState<"ok" | "missing" | "failed">("ok");
  // The fact being written: "new" for the add field, a fact id for an edit.
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const [ask, setAsk] = useState<"remove" | "deceased" | null>(null);
  const base = `/contacts/${encodeURIComponent(id)}`;
  const [labelDraft, setLabelDraft] = useState("");
  // The owner's goals for „exclude for a goal": null until asked for.
  const [goals, setGoals] = useState<{ id: string; title: string }[] | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    return apiFetch<unknown>(base)
      .then((raw) => setC(parse(raw)))
      .catch((e: unknown) => { setC(null); setState(e instanceof ApiError && e.status === 404 ? "missing" : "failed"); });
  }, [base]);

  useEffect(() => {
    let alive = true;
    apiFetch<unknown>(base)
      .then((raw) => { if (alive) setC(parse(raw)); })
      .catch((e: unknown) => { if (alive) { setC(null); setState(e instanceof ApiError && e.status === 404 ? "missing" : "failed"); } });
    return () => { alive = false; };
  }, [base]);

  // One door for every write: on success the page shows what the server
  // answered (the fact list) or reads the contact again; on failure it says
  // so and keeps what the person typed.
  async function write(path: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: unknown): Promise<unknown | null> {
    setBusy(true);
    setErr(false);
    try {
      return (await apiFetch<unknown>(path, body === undefined ? { method } : { method, body })) ?? {};
    } catch {
      setErr(true);
      return null;
    } finally {
      setBusy(false);
    }
  }

  function applyFacts(raw: unknown) {
    const d = unwrapData(raw);
    if (isRecord(d) && Array.isArray(d.facts)) setC((prev) => (prev ? { ...prev, facts: parseFacts(d.facts) } : prev));
    else void load();
  }

  async function saveFact() {
    const text = draft.trim();
    if (!text || busy || !editing) return;
    const out = editing === "new"
      ? await write(`${base}/facts`, "POST", { text })
      : await write(`${base}/facts/${encodeURIComponent(editing)}`, "PATCH", { text });
    if (out === null) return;
    applyFacts(out);
    setEditing(null);
    setDraft("");
  }

  async function forgetFact(factId: string) {
    const out = await write(`${base}/facts/${encodeURIComponent(factId)}`, "DELETE");
    if (out !== null) applyFacts(out);
  }

  async function liftExclusion(exId: string) {
    const out = await write(`${base}/exclusions/${encodeURIComponent(exId)}`, "DELETE");
    if (out !== null) setC((prev) => (prev ? { ...prev, exclusions: prev.exclusions.filter((e) => e.id !== exId) } : prev));
  }

  async function confirmAsk() {
    const which = ask;
    if (!which) return;
    const out = await write(`${base}/${which === "remove" ? "remove" : "deceased"}`, "POST");
    setAsk(null);
    if (out === null) return;
    if (which === "remove") router.push("/profile/contacts");
    else void load();
  }

  async function setWarmth(w: "warm" | "neutral" | "distant") {
    if (!c) return;
    const next = c.warmth === w ? null : w;
    const out = await write(`${base}/warmth`, "PUT", { warmth: next });
    // With null the server goes back to its own reading, which only a fresh
    // read of the contact can show.
    if (out !== null) void load();
  }

  async function addLabel() {
    const label = labelDraft.trim();
    if (!label || busy) return;
    const out = await write(`${base}/labels`, "POST", { label });
    if (out === null) return;
    setLabelDraft("");
    void load();
  }

  async function removeLabel(label: string) {
    const out = await write(`${base}/labels/${encodeURIComponent(label)}`, "DELETE");
    if (out !== null) setC((prev) => (prev ? { ...prev, ownLabels: prev.ownLabels.filter((l) => l !== label) } : prev));
  }

  async function openGoalPicker() {
    setPicking(true);
    if (goals !== null) return;
    try {
      const raw = await apiFetch<unknown>("/threads?limit=50");
      const list = recordItems(pickArray(unwrapData(raw)));
      const seen = new Set<string>();
      setGoals(list.flatMap((t) => {
        // The goal id, never the thread id: they are different numbers.
        const gid = idOf(t.goal_id);
        if (!gid || seen.has(gid) || t.is_task !== true) return [];
        seen.add(gid);
        return [{ id: gid, title: typeof t.title === "string" && t.title.trim() ? t.title : `#${gid}` }];
      }));
    } catch {
      setGoals([]);
      setErr(true);
    }
  }

  async function excludeFor(goalId: string) {
    const out = await write(`${base}/exclusions`, "POST", { goal_id: Number(goalId) });
    if (out === null) return;
    setPicking(false);
    void load();
  }

  const initial = c?.name ? Array.from(c.name.trim())[0] ?? "" : "";

  const factField = (
    <div className="flex flex-col gap-2">
      <label className="nx-field" style={{ marginBottom: 0 }}>
      <textarea
        rows={2}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={s.factPlaceholder}
        maxLength={500}
        style={{ fontSize: 16 }}
        autoFocus
      />
      </label>
      <div className="nx-row" style={{ marginTop: 0 }}>
        <button type="button" className="nx-btn primary" disabled={busy || !draft.trim()} onClick={saveFact}>{s.save}</button>
        <button type="button" className="nx-btn" disabled={busy} onClick={() => { setEditing(null); setDraft(""); }}>{s.cancel}</button>
      </div>
    </div>
  );

  return (
    <SheetPage title={c?.name ?? "…"} backHref="/profile/contacts" backLabel={s.back} closeLabel={s.close}>
      {ask && (
        <ConfirmDialog
          message={ask === "remove" ? s.removeAsk : s.deceasedAsk}
          confirmLabel={ask === "remove" ? s.removeContact : s.deceased}
          cancelLabel={s.cancel}
          busy={busy}
          danger
          onConfirm={confirmAsk}
          onCancel={() => setAsk(null)}
        />
      )}
      {c === undefined && <span className="sk-bar" style={{ width: "60%" }} />}
      {c === null && (
        <p className={state === "missing" ? "nx-empty" : "nx-intro"} style={state === "missing" ? undefined : { color: "var(--danger)" }}>
          {state === "missing" ? s.notFound : s.failed}
        </p>
      )}
      {c && (
        <>
          {/* The design's avatar holds a number from its mock chain; here it
              is the first letter of the name, the one thing the page knows. Not
              upper-cased: that turns a Georgian letter into Mtavruli. */}
          {(c.role || c.onNetai) && (
            <div className="nx-member">
              <span className="nx-avatar" aria-hidden="true">{initial}</span>
              <div className="min-w-0">
                {c.role && <b style={{ font: "600 16px/1.35 var(--font-system)", color: "var(--nx-ink)", overflowWrap: "anywhere" }}>{c.role}</b>}
                {c.onNetai && <p className="nx-muted" style={{ font: "400 14px/1.65 var(--font-system)" }}>{s.onNetai}</p>}
              </div>
            </div>
          )}
          <p className="nx-note">{s.note}</p>

          <h3 className="nx-h3">{s.labels}</h3>
          <div className="nx-tags">
            {c.labels.map((l) => <span key={`i-${l}`} className="nx-pill">{l}</span>)}
            {c.ownLabels.map((l) => (
              <span key={`o-${l}`} className="nx-pill">
                {l}
                <button type="button" aria-label={`${s.forget}: ${l}`} disabled={busy} onClick={() => removeLabel(l)} style={{ marginLeft: 6 }}>×</button>
              </span>
            ))}
          </div>
          <div className="nx-row" style={{ marginTop: 6, flexWrap: "nowrap" }}>
            <label className="nx-field" style={{ marginBottom: 0, flex: 1 }}>
              <input value={labelDraft} maxLength={40} placeholder={s.labelPlaceholder} onChange={(e) => setLabelDraft(e.target.value)} style={{ fontSize: 16 }} />
            </label>
            <button type="button" className="nx-btn shrink-0" disabled={busy || !labelDraft.trim()} onClick={addLabel}>{s.add}</button>
          </div>

          <h3 className="nx-h3">{s.warmthTitle}</h3>
          <div className="nx-tags" role="group" aria-label={s.warmthTitle}>
            {(["warm", "neutral", "distant"] as const).map((w) => (
              <button
                key={w}
                type="button"
                className={`nx-pill${c.warmth === w ? " on" : ""}`}
                aria-pressed={c.warmth === w}
                disabled={busy}
                onClick={() => setWarmth(w)}
              >
                {s.warmth[w]}
              </button>
            ))}
          </div>

          {err && <p role="status" className="nx-note" style={{ color: "var(--danger)" }}>{s.saveFailed}</p>}

          <div className="nx-card">
            <h3>{s.facts}</h3>
            {c.facts.length === 0 && editing !== "new" && <p className="nx-note">{s.noFacts}</p>}
            {c.facts.map((f, i) => (
              <div key={f.id ?? `i${i}`} className="flex flex-col gap-1">
                {editing !== null && editing === f.id ? factField : (
                  <>
                    <p>{f.value}</p>
                    {f.id && (
                      <div className="nx-links">
                        <button type="button" disabled={busy} onClick={() => { setEditing(f.id); setDraft(f.value); }}>{s.edit}</button>
                        <button type="button" disabled={busy} onClick={() => f.id && forgetFact(f.id)}>{s.forget}</button>
                      </div>
                    )}
                  </>
                )}
              </div>
            ))}
            {editing === "new" ? factField : (
              <button type="button" className="nx-btn self-start" disabled={busy} onClick={() => { setEditing("new"); setDraft(""); }}>{s.addFact}</button>
            )}
          </div>

          {c.publicFacts.length > 0 && (
            <div className="nx-card">
              <h3>{s.publicFacts}</h3>
              {c.publicFacts.map((f, i) => (
                <div key={i}>
                  <p>{f.value}</p>
                  {(f.sourceUrl || f.date) && (
                    <div className="nx-row" style={{ marginTop: 2 }}>
                      {f.sourceUrl && <a href={f.sourceUrl} target="_blank" rel="noopener noreferrer" className="nx-link">{s.source}</a>}
                      {f.date && <span className="nx-note">{fmtDateShort(f.date)}</span>}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {(
            <div className="nx-card">
              <h3>{s.excluded}</h3>
              {c.exclusions.map((e, i) => (
                <div key={e.id ?? `i${i}`} className="nx-row between" style={{ marginTop: 0 }}>
                  <p style={{ margin: 0 }}>{e.text}</p>
                  {e.id && (
                    <div className="nx-links">
                      <button type="button" disabled={busy} onClick={() => e.id && liftExclusion(e.id)}>{s.lift}</button>
                    </div>
                  )}
                </div>
              ))}
              {picking ? (
                goals === null ? <span className="sk-bar" style={{ width: "60%" }} /> : goals.length === 0 ? (
                  <p className="nx-note">{s.noGoals}</p>
                ) : (
                  <div className="flex flex-col gap-1">
                    {goals.map((g) => (
                      <button key={g.id} type="button" className="nx-btn self-start" disabled={busy} onClick={() => excludeFor(g.id)}>{g.title}</button>
                    ))}
                    <div className="nx-links"><button type="button" onClick={() => setPicking(false)}>{s.cancel}</button></div>
                  </div>
                )
              ) : (
                <button type="button" className="nx-btn self-start" disabled={busy} onClick={openGoalPicker}>{s.excludeGoal}</button>
              )}
            </div>
          )}

          {/* 389: a contact on Netai has a member card, what they themselves
              show. 1849: the map of how to reach them. */}
          {c.onNetai && (
            <div className="nx-row">
              <Link href={`/members/${encodeURIComponent(id)}`} className="nx-btn">{s.memberCard}</Link>
            </div>
          )}
          <PathMap contactId={id} />

          <div className="nx-row" style={{ marginTop: 8 }}>
            <button type="button" className="nx-btn danger" disabled={busy} onClick={() => setAsk("remove")}>{s.removeContact}</button>
            <button type="button" className="nx-btn" disabled={busy} onClick={() => setAsk("deceased")}>{s.deceased}</button>
          </div>
        </>
      )}
    </SheetPage>
  );
}
