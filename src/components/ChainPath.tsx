"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { t } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 4927 (13 Oct, Giorgi; backend 0260). A case shows its path: who came
// before (if anyone), the person, who comes after. Since backend 19:45Z this
// covers the owner's own goals too, with no one before. The path is drawn
// when anyone stands before or after the person. Names are as the server gives them: never guessed,
// and a row without a name is left out rather than drawn as a blank chip.
//
// One answer per thread and update stamp, shared by every card that shows it,
// so the list does not ask again on each render. Any failure draws nothing:
// a path is extra information and its absence says nothing false.

type Chain = { previous: string | null; next: string[] };

const cache = new Map<string, Promise<Chain | null>>();

function parseChain(d: unknown): Chain | null {
  if (!isRecord(d)) return null;
  const prev = isRecord(d.previous) && typeof d.previous.name === "string" && d.previous.name.trim() ? d.previous.name.trim() : null;
  const next = recordItems(pickArray(d.next)).flatMap((r) =>
    typeof r.person_name === "string" && r.person_name.trim() ? [r.person_name.trim()] : []);
  return { previous: prev, next };
}

function loadOne(threadId: string): Promise<Chain | null> {
  return apiFetch<unknown>(`/threads/${encodeURIComponent(threadId)}/chain-position`).then((raw) => parseChain(unwrapData(raw)));
}

// 4927 (a), backend 0322 (15 Oct): GET /threads/chain-positions?ids=… answers
// up to 30 conversations at once. Cards that come on screen within one
// moment are asked together, so a list screen costs one call, not one per
// card. Until the batch route exists (a 404), each id is asked on its own as
// before.
const BATCH_MAX = 30;
let queue: { id: string; resolve: (c: Chain | null) => void; reject: () => void }[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let batchMissing = false;

function flush() {
  timer = null;
  const all = queue;
  queue = [];
  for (let i = 0; i < all.length; i += BATCH_MAX) {
    const part = all.slice(i, i + BATCH_MAX);
    const ids = [...new Set(part.map((q) => q.id))];
    apiFetch<unknown>(`/threads/chain-positions?ids=${ids.map(encodeURIComponent).join(",")}`)
      .then((raw) => {
        const d = unwrapData(raw);
        const positions = isRecord(d) && isRecord(d.positions) ? d.positions : null;
        if (!positions) { part.forEach((q) => q.reject()); return; }
        part.forEach((q) => q.resolve(parseChain(positions[q.id]) ?? { previous: null, next: [] }));
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 404) {
          batchMissing = true;
          part.forEach((q) => loadOne(q.id).then(q.resolve, q.reject));
        } else {
          part.forEach((q) => q.reject());
        }
      });
  }
}

function viaBatch(threadId: string): Promise<Chain | null> {
  if (batchMissing || !/^\d+$/.test(threadId)) return loadOne(threadId);
  return new Promise((resolve, reject) => {
    queue.push({ id: threadId, resolve, reject });
    if (!timer) timer = setTimeout(flush, 60);
  });
}

function load(threadId: string, stamp: string): Promise<Chain | null> {
  const key = `${threadId}@${stamp}`;
  let p = cache.get(key);
  if (!p) {
    p = viaBatch(threadId).catch(() => {
      // A failure, a 429 above all (30 a minute), draws no path this time
      // and is not remembered, so a later look may ask again.
      cache.delete(key);
      return null;
    });
    cache.set(key, p);
  }
  return p;
}

// Backend 17:39Z: asked only for cards on screen, so a long list does not
// spend the minute's calls on cards nobody sees.
//
// #5124 (Lika, 18 Oct): on the phone's cards the path arrived after the card
// was drawn and pushed everything below it down, mid-scroll. There (`eager`)
// it is asked for at once rather than on sight, and the line it will take is
// held empty until the answer comes, so a card with a path never grows.
export default function ChainPath({ threadId, stamp, className = "", eager = false }: { threadId: string; stamp: string; className?: string; eager?: boolean }) {
  const [chain, setChain] = useState<Chain | null | undefined>(undefined);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [seenOnScreen, setSeen] = useState(false);
  const seen = eager || seenOnScreen;

  useEffect(() => {
    if (!anchor || seen) return;
    if (typeof IntersectionObserver === "undefined") {
      const id = requestAnimationFrame(() => setSeen(true));
      return () => cancelAnimationFrame(id);
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setSeen(true); io.disconnect(); }
    });
    io.observe(anchor);
    return () => io.disconnect();
  }, [anchor, seen]);

  useEffect(() => {
    if (!seen) return;
    let live = true;
    load(threadId, stamp).then((c) => { if (live) setChain(c); });
    return () => { live = false; };
  }, [seen, threadId, stamp]);

  // Giorgi's retest (14 Oct): „<previous> → თქვენ" is a path too, so a case
  // with someone before and nobody after still shows it.
  if (chain === undefined && eager) {
    return (
      <span className={`dz-chain ${className}`} aria-hidden="true">
        <span className="nm" style={{ visibility: "hidden" }}>{t("chainYou")}</span>
      </span>
    );
  }
  if (!chain || (chain.next.length === 0 && !chain.previous)) return <span ref={setAnchor} aria-hidden="true" />;
  const shown = chain.next.slice(0, 2);
  const more = chain.next.length - shown.length;
  return (
    <span className={`dz-chain ${className}`} aria-label={[chain.previous, t("chainYou"), ...chain.next].filter(Boolean).join(" → ")}>
      {chain.previous && (<><span className="nm">{chain.previous}</span><span className="arr" aria-hidden="true">→</span></>)}
      <span className="nm me">{t("chainYou")}</span>
      {shown.length > 0 && <span className="arr" aria-hidden="true">→</span>}
      {shown.map((n, i) => <span key={i} className="nm">{n}</span>)}
      {more > 0 && <span className="nm">+{more}</span>}
    </span>
  );
}
