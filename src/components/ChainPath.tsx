"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { t } from "@/lib/i18n";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";

// 4927 (13 Oct, Giorgi; backend 0260). On a case where the person stands in
// the middle of a chain, the card shows the path: who came before, the person,
// who comes after. GET /threads/:id/chain-position answers it per thread; the
// path is drawn only when someone comes after (`next` non-empty), which is
// what the task asks for. Names are as the server gives them: never guessed,
// and a row without a name is left out rather than drawn as a blank chip.
//
// One answer per thread and update stamp, shared by every card that shows it,
// so the list does not ask again on each render. Any failure draws nothing:
// a path is extra information and its absence says nothing false.

type Chain = { previous: string | null; next: string[] };

const cache = new Map<string, Promise<Chain | null>>();

function load(threadId: string, stamp: string): Promise<Chain | null> {
  const key = `${threadId}@${stamp}`;
  let p = cache.get(key);
  if (!p) {
    p = apiFetch<unknown>(`/threads/${encodeURIComponent(threadId)}/chain-position`)
      .then((raw) => {
        const d = unwrapData(raw);
        if (!isRecord(d)) return null;
        const prev = isRecord(d.previous) && typeof d.previous.name === "string" && d.previous.name.trim() ? d.previous.name.trim() : null;
        const next = recordItems(pickArray(d.next)).flatMap((r) =>
          typeof r.person_name === "string" && r.person_name.trim() ? [r.person_name.trim()] : []);
        return { previous: prev, next };
      })
      .catch(() => {
        // A failure, a 429 above all (30 a minute, like /routes), draws no
        // path this time and is not remembered, so a later look may ask again.
        cache.delete(key);
        return null;
      });
    cache.set(key, p);
  }
  return p;
}

// Backend 17:39Z: asked only for cards on screen, so a long list does not
// spend the minute's calls on cards nobody sees.
export default function ChainPath({ threadId, stamp }: { threadId: string; stamp: string }) {
  const [chain, setChain] = useState<Chain | null>(null);
  const [anchor, setAnchor] = useState<HTMLSpanElement | null>(null);
  const [seen, setSeen] = useState(false);

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

  if (!chain || chain.next.length === 0) return <span ref={setAnchor} aria-hidden="true" />;
  const shown = chain.next.slice(0, 2);
  const more = chain.next.length - shown.length;
  return (
    <span className="dz-chain" aria-label={[chain.previous, t("chainYou"), ...chain.next].filter(Boolean).join(" → ")}>
      {chain.previous && (<><span className="nm">{chain.previous}</span><span className="arr" aria-hidden="true">→</span></>)}
      <span className="nm me">{t("chainYou")}</span>
      <span className="arr" aria-hidden="true">→</span>
      {shown.map((n, i) => <span key={i} className="nm">{n}</span>)}
      {more > 0 && <span className="nm">+{more}</span>}
    </span>
  );
}
