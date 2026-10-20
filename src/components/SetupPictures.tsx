"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { authHeaders } from "@/lib/deviceId";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";
import DzIcon from "@/components/DzIcons";
import { getLocale } from "@/lib/i18n";
import type { Gadget, Step } from "@/lib/setup";
import { guideSetsFor, guideShots, type GuideSet } from "@/lib/setupGuides";

// #6139 (task 1882, founder D689; backend 19 Oct 09:00Z). Each setup step
// shows the real screen of THIS gadget with the tap marked, in tap order,
// each with the server's own caption. The pictures and their captions live on
// the server and change from the admin without a deploy, so nothing about
// them is written here.
//
// Until the list arrives, when the step has none for this gadget, or when it
// could not be loaded, the card shows the pictures bundled with the app
// (lib/setupGuides, backend 20 Oct 19:10Z), and where there are none of those
// either, it keeps its taps in words (`fallback`): the
// words are the same instructions, so a failure costs the pictures and
// nothing else.
//
// The image route needs the Authorization header, which an <img src> cannot
// send, so each picture is fetched with the token and shown as a blob. Its
// url carries `v`, which changes when the admin replaces it, so a blob is
// kept per url for the life of the page.

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Picture = { position: number; caption: string; url: string };

function parsePictures(raw: unknown): Picture[] {
  const d = unwrapData(raw);
  if (!isRecord(d)) return [];
  return recordItems(pickArray(d.pictures))
    .flatMap((p) =>
      typeof p.url === "string" && p.url && typeof p.position === "number"
        ? [{ position: p.position, caption: typeof p.caption === "string" ? p.caption.trim() : "", url: p.url }]
        : [])
    .sort((a, b) => a.position - b.position);
}

const blobs = new Map<string, Promise<string | null>>();

function loadBlob(url: string): Promise<string | null> {
  let p = blobs.get(url);
  if (!p) {
    p = fetch(`${API_BASE}${url}`, { headers: authHeaders() })
      .then((r) => (r.ok ? r.blob() : null))
      .then((b) => (b ? URL.createObjectURL(b) : null))
      .catch(() => null)
      .then((src) => {
        // A failure is not remembered, so the next visit asks again.
        if (!src) blobs.delete(url);
        return src;
      });
    blobs.set(url, p);
  }
  return p;
}

function Shot({ pic, n }: { pic: Picture; n: number }) {
  // undefined while loading, null when it could not be loaded.
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let live = true;
    loadBlob(pic.url).then((s) => { if (live) setSrc(s); });
    return () => { live = false; };
  }, [pic.url]);
  return (
    <figure className="nx-shot">
      <div className="nx-shot-img">
        {src ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={pic.caption} />
        ) : src === null ? (
          <span className="nx-shot-missing" aria-hidden="true">{n}</span>
        ) : null}
      </div>
      {pic.caption && (
        <figcaption>
          <b>{n}</b> {pic.caption}
        </figcaption>
      )}
    </figure>
  );
}

export default function SetupPictures({ gadget, step, fallback }: { gadget: Gadget; step: Step; fallback: ReactNode }) {
  // undefined while asking; an empty list both for "none" and "could not
  // load", since both fall back to the same words.
  const [pics, setPics] = useState<Picture[] | undefined>(undefined);
  useEffect(() => {
    let live = true;
    apiFetch<unknown>(`/setup/pictures?gadget=${encodeURIComponent(gadget)}&step=${encodeURIComponent(step)}`)
      .then((raw) => parsePictures(raw))
      .catch(() => [] as Picture[])
      .then((list) => { if (live) setPics(list); });
    return () => { live = false; };
  }, [gadget, step]);

  if (!pics || pics.length === 0) {
    const sets = guideSetsFor(gadget, step);
    return sets.length > 0 ? <BundledGuide sets={sets} /> : <>{fallback}</>;
  }
  return (
    <div className="nx-shots">
      {pics.map((p, i) => <Shot key={p.url} pic={p} n={i + 1} />)}
    </div>
  );
}

const SET_LABEL: Partial<Record<GuideSet, string>> = { "iphone-claude": "Claude", "iphone-chatgpt": "ChatGPT" };

// More than one set (the iPhone connector) is a choice: Claude or ChatGPT.
function BundledGuide({ sets }: { sets: GuideSet[] }) {
  const [set, setSet] = useState<GuideSet>(sets[0]);
  const current = sets.includes(set) ? set : sets[0];
  return (
    <div className="flex flex-col gap-2">
      {sets.length > 1 && (
        <div className="nx-guide-tabs" role="tablist">
          {sets.map((g) => (
            <button key={g} type="button" role="tab" aria-selected={g === current} className={g === current ? "on" : undefined} onClick={() => setSet(g)}>
              {SET_LABEL[g] ?? g}
            </button>
          ))}
        </div>
      )}
      {/* Keyed by the set, so a switch starts the new one at its first picture. */}
      <GuideViewer key={current} set={current} />
    </div>
  );
}

// One picture at a time: a swipe (the strip snaps) or the arrows, with
// „N / total" and the caption under it.
function GuideViewer({ set }: { set: GuideSet }) {
  const shots = guideShots(set);
  const ka = getLocale() === "ka";
  const strip = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);

  function go(i: number) {
    const el = strip.current;
    const n = Math.max(0, Math.min(shots.length - 1, i));
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: "smooth" });
    setAt(n);
  }

  function onScroll() {
    const el = strip.current;
    if (!el || el.clientWidth === 0) return;
    const n = Math.round(el.scrollLeft / el.clientWidth);
    if (n !== at && n >= 0 && n < shots.length) setAt(n);
  }

  const wide = !set.startsWith("iphone-");
  return (
    <figure className={`nx-guide${wide ? " wide" : ""}`}>
      <div className="nx-guide-strip" ref={strip} onScroll={onScroll}>
        {shots.map((sh, i) => (
          <div key={sh.src} className="nx-guide-slide" aria-hidden={i !== at}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={sh.src} alt={sh.caption} loading={i < 2 ? "eager" : "lazy"} />
          </div>
        ))}
      </div>
      <div className="nx-guide-nav">
        <button type="button" aria-label={ka ? "წინა" : "Previous"} disabled={at === 0} onClick={() => go(at - 1)}>
          <DzIcon name="left" size={16} />
        </button>
        <span aria-live="polite">{at + 1} / {shots.length}</span>
        <button type="button" aria-label={ka ? "შემდეგი" : "Next"} disabled={at === shots.length - 1} onClick={() => go(at + 1)}>
          <DzIcon name="right" size={16} />
        </button>
      </div>
      <figcaption>{shots[at]?.caption}</figcaption>
    </figure>
  );
}
