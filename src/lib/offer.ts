"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { isRecord, unwrapData } from "@/lib/payload";

// GET /billing/offer (backend, 9 Oct 21:50Z; public, no token needed): the
// numbers about money that the server owns and the pages only repeat. The
// card trial, the days an invitation carries and, once the backend adds them,
// the plan prices. Every field is null until the server has said it; each
// page decides what it shows meanwhile, and none of them writes a number of
// its own over a value the server sent.

export type Offer = {
  cardTrialDays: number | null;
  // null both while unknown and while the dashboard switch is off; the pages
  // draw no invitation line in either case.
  inviteFreeDays: number | null;
  prices: { pro: number | null; enterprise: number | null };
};

const EMPTY: Offer = { cardTrialDays: null, inviteFreeDays: null, prices: { pro: null, enterprise: null } };

function posInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v > 0 ? v : null;
}

function posPrice(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null;
}

export function useOffer(): Offer {
  const [offer, setOffer] = useState<Offer>(EMPTY);
  useEffect(() => {
    let alive = true;
    apiFetch<unknown>("/billing/offer")
      .then((raw) => {
        const d = unwrapData(raw);
        if (!alive || !isRecord(d)) return;
        const plans = isRecord(d.plans) ? d.plans : {};
        setOffer({
          cardTrialDays: posInt(d.card_trial_days),
          inviteFreeDays: posInt(d.invite_free_days),
          prices: { pro: posPrice(plans.pro), enterprise: posPrice(plans.enterprise) },
        });
      })
      .catch(() => { /* every page keeps its own fallback */ });
    return () => { alive = false; };
  }, []);
  return offer;
}
