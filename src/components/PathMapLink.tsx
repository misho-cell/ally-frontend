"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { getLocale } from "@/lib/i18n";
import { parsePaths } from "@/components/PathMap";

// #1849 (28 Oct, Lika). A reply after a path search told the bridges in text
// only, while the drawn map existed and opened only from a contact's page.
// The reply now carries the person it reached (path_map_id), and this link
// opens that map.
//
// The map is read first and the link appears only when it has a path: a
// link to an empty map, or to a 404, would promise something that is not
// there. One read per person per page load, however many replies name them.

const L = {
  en: { open: "Path on the map" },
  ka: { open: "გზა რუკაზე" },
};

const known = new Map<string, Promise<boolean>>();

function hasPath(id: string): Promise<boolean> {
  let p = known.get(id);
  if (!p) {
    p = apiFetch<unknown>(`/paths/${encodeURIComponent(id)}`)
      .then((raw) => parsePaths(raw).length > 0)
      .catch(() => false);
    known.set(id, p);
  }
  return p;
}

export default function PathMapLink({ id }: { id: string }) {
  const s = L[getLocale()];
  const [show, setShow] = useState(false);

  useEffect(() => {
    let alive = true;
    void hasPath(id).then((yes) => { if (alive) setShow(yes); });
    return () => { alive = false; };
  }, [id]);

  if (!show) return null;
  return (
    <Link
      href={`/paths/${encodeURIComponent(id)}`}
      className="self-start"
      style={{ font: "600 11.5px/16px var(--font-system)", color: "var(--accent-strong)", textDecoration: "underline" }}
    >
      {s.open}
    </Link>
  );
}
