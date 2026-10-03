"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { apiFetch, ApiError } from "@/lib/api";
import { getLocale, fmtDateLoc } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";
import ConfirmDialog from "@/components/ConfirmDialog";

// #505 (3 Oct). Blocking somebody has worked for weeks, but only as a
// sentence in chat, so there was no way to see whom you had blocked and no
// way to undo it without remembering the name. A block you cannot see is a
// decision the app made on your behalf and then hid from you.
//
// The server half went live at 05:41:37Z under /profile, not /contacts: the
// contacts routes want a subscription, and reading or undoing your own blocks
// must not depend on paying.
//
// `ref` names the block, never the person: no phone number is in this payload
// and none is wanted here.
const L = {
  en: {
    back: "← Profile",
    title: "Blocked",
    intro: "People you asked the assistant to block. It will not contact them for you, and it will not suggest them. Unblocking takes effect at once.",
    empty: "You have not blocked anybody.",
    // A list that could not be read is not an empty list. Saying "nobody"
    // when we simply failed to ask would be telling somebody their blocks
    // are gone.
    loadFailed: "Could not load the list. It is unchanged.",
    retry: "Try again",
    unblock: "Unblock",
    noName: "Name not given",
    blockedOn: (d: string) => `Blocked ${d}`,
    confirm: (who: string) => `Unblock ${who}? The assistant will be able to contact them and suggest them again.`,
    cancel: "Cancel",
    gone: "That block no longer exists.",
    failed: "Could not unblock. Nothing has changed.",
  },
  ka: {
    back: "← პროფილი",
    title: "დაბლოკილები",
    intro: "ადამიანები, რომლებიც ასისტენტს დაბლოკვა სთხოვე. ის მათ შენი სახელით აღარ დაუკავშირდება და აღარ შემოგთავაზებს. განბლოკვა მაშინვე მოქმედებს.",
    empty: "არავინ გყავს დაბლოკილი.",
    loadFailed: "სია ვერ ჩაიტვირთა. ის უცვლელია.",
    retry: "თავიდან",
    unblock: "განბლოკვა",
    noName: "სახელი არ მიუთითებია",
    blockedOn: (d: string) => `დაიბლოკა ${d}`,
    confirm: (who: string) => `განვბლოკო ${who}? ასისტენტი კვლავ შეძლებს მასთან დაკავშირებას და შემოთავაზებას.`,
    cancel: "გაუქმება",
    gone: "ეს ბლოკი უკვე აღარ არსებობს.",
    failed: "ვერ განიბლოკა. არაფერი შეცვლილა.",
  },
};

// `name` may be null — somebody blocked before they ever registered has no
// label of their own. The row then says so rather than leaving a gap that
// reads as a broken screen.
type Blocked = { ref?: number | string | null; name?: string | null; blocked_at?: string | null };

export default function BlockedPage() {
  const s = L[getLocale()];
  // null means "not read yet or not readable", [] means "read, and nobody is
  // blocked". They draw different things, so they are different values.
  const [rows, setRows] = useState<Blocked[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [asking, setAsking] = useState<Blocked | null>(null);
  const [busy, setBusy] = useState(false);

  // Nothing is set before the first await, so the first render is not
  // immediately followed by a second one that changes nothing.
  const load = useCallback(async () => {
    try {
      const res = await apiFetch<unknown>("/profile/blocked");
      const body = unwrapData(res);
      const list = isRecord(body) ? pickArray(body, ["blocked"]) : [];
      setRows(recordItems(list) as Blocked[]);
      // Cleared only on a read that worked. A retry still in flight leaves
      // the last failure on screen, because it is still the last thing that
      // actually happened.
      setError(null);
    } catch (err) {
      setRows(null);
      setError(err instanceof ApiError ? err.message : s.loadFailed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Once, not once per mount: in development React mounts twice, and two
  // reads of the same list race to set it. The retry button is the only
  // other way in, and it is a deliberate press.
  const loadedOnce = useRef(false);
  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void load();
  }, [load]);

  const label = (b: Blocked) => (typeof b.name === "string" && b.name.trim() ? b.name : s.noName);

  async function unblock(b: Blocked) {
    const ref = b.ref == null ? "" : String(b.ref);
    if (!ref) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch(`/profile/blocked/${encodeURIComponent(ref)}`, { method: "DELETE" });
      setRows((prev) => (prev ? prev.filter((x) => String(x.ref) !== ref) : prev));
      setAsking(null);
    } catch (err) {
      // 404 means the block is already gone — the row is wrong, not the tap,
      // so it leaves the list and the screen says why. Any other failure
      // leaves the row exactly where it is: an unblock that did not happen
      // must not look like one that did.
      if (err instanceof ApiError && err.status === 404) {
        setRows((prev) => (prev ? prev.filter((x) => String(x.ref) !== ref) : prev));
        setNotice(s.gone);
        setAsking(null);
      } else {
        setNotice(s.failed);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex flex-col" style={{ maxWidth: "620px", padding: "28px 24px 40px", gap: "14px" }}>
        <div className="mb-1 flex items-center gap-3">
          <Link href="/profile" className="transition-colors" style={{ fontSize: "13px", fontWeight: 600, color: "var(--ink-soft)" }}>{s.back}</Link>
          <span style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</span>
        </div>

        <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.intro}</p>

        {notice && (
          <div className="px-4 py-3 text-sm" style={{ background: "var(--terra-tint)", color: "var(--danger)", borderRadius: "var(--radius-tile)" }}>{notice}</div>
        )}

        {error ? (
          <div className="card flex flex-col items-start gap-3">
            <p className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>
            <button type="button" onClick={load} className="btn-secondary">{s.retry}</button>
          </div>
        ) : rows === null ? (
          <div className="flex flex-col gap-3">
            <span className="sk-bar" style={{ width: "100%", height: 64, borderRadius: "var(--radius-card)" }} />
            <span className="sk-bar" style={{ width: "100%", height: 64, borderRadius: "var(--radius-card)" }} />
          </div>
        ) : rows.length === 0 ? (
          <div className="card"><p className="text-sm" style={{ color: "var(--meta)" }}>{s.empty}</p></div>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((b) => (
              <div key={String(b.ref)} className="card flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate" style={{ fontSize: "14px", fontWeight: 600, color: "var(--ink)" }}>{label(b)}</p>
                  {b.blocked_at && (
                    <p className="mt-0.5" style={{ fontSize: "12.5px", color: "var(--ink-soft)" }}>
                      {s.blockedOn(fmtDateLoc(b.blocked_at))}
                    </p>
                  )}
                </div>
                <button type="button" onClick={() => setAsking(b)} className="btn-secondary shrink-0">
                  {s.unblock}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {asking && (
        <ConfirmDialog
          message={s.confirm(label(asking))}
          confirmLabel={s.unblock}
          cancelLabel={s.cancel}
          busy={busy}
          onConfirm={() => void unblock(asking)}
          onCancel={() => { if (!busy) setAsking(null); }}
        />
      )}
    </div>
  );
}
