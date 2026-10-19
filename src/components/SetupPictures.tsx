"use client";

import { useEffect, useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api";
import { authHeaders } from "@/lib/deviceId";
import { isRecord, unwrapData, pickArray, recordItems } from "@/lib/payload";
import type { Gadget, Step } from "@/lib/setup";

// #6139 (task 1882, founder D689; backend 19 Oct 09:00Z). Each setup step
// shows the real screen of THIS gadget with the tap marked, in tap order,
// each with the server's own caption. The pictures and their captions live on
// the server and change from the admin without a deploy, so nothing about
// them is written here.
//
// Until the list arrives, when the step has none for this gadget, or when it
// could not be loaded, the card keeps its taps in words (`fallback`): the
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

  if (!pics || pics.length === 0) return <>{fallback}</>;
  return (
    <div className="nx-shots">
      {pics.map((p, i) => <Shot key={p.url} pic={p} n={i + 1} />)}
    </div>
  );
}
