"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { authHeaders } from "@/lib/deviceId";
import { getLocale } from "@/lib/i18n";
import { skipOnboarding } from "@/lib/user";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
// FT-6 (2 Sept): "which step am I on" (as opposed to "is onboarding done at
// all") is purely client-side UI state — the backend confirmed this is the
// right place for it. Without it, a refresh during the matched-contacts
// screen lost the already-picked contacts and dropped the user back to the
// very start, even though the server-side onboarding status hadn't changed.
const PENDING_KEY = "netai_onboarding_pending";

const L = {
  en: {
    uploaded: "Contacts uploaded!",
    added: "Added",
    skipped: "Skipped",
    start: "Start",
    title: "Import your contacts",
    body: "Netai uses your contacts to help you work your network.",
    shareContacts: "Share contacts",
    uploadVcf: "Upload .vcf file",
    skip: "Skip",
    importError: "Couldn't import contacts",
    alreadyHereTitle: "Already here waiting for you",
    alreadyHereBody: "These people from your contacts are already on Netai:",
    continueImport: "Continue",
  },
  ka: {
    uploaded: "კონტაქტები აიტვირთა!",
    added: "დაემატა",
    skipped: "გამოტოვებულია",
    start: "დაწყება",
    title: "ატვირთე შენი კონტაქტები",
    body: "Netai შენს კონტაქტებს იყენებს, რომ შენი ქსელით დაგეხმაროს.",
    shareContacts: "კონტაქტების გაზიარება",
    uploadVcf: "ატვირთე .vcf ფაილი",
    skip: "გამოტოვება",
    importError: "კონტაქტები ვერ აიტვირთა",
    alreadyHereTitle: "აქ უკვე გელოდებიან",
    alreadyHereBody: "შენი კონტაქტებიდან ეს ადამიანები უკვე Netai-ზეა:",
    continueImport: "გაგრძელება",
  },
};

type ImportResult = { imported: number; skipped: number };
type PendingContact = { name: string; phones: string[]; email?: string; city?: string };

export default function OnboardingContactsPage() {
  const s = L[getLocale()];
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [hasContactsApi, setHasContactsApi] = useState(false);
  // T4 (26 Aug): between permission grant and the actual import, show who
  // from the picked contacts already has a Netai account.
  const [matchedNames, setMatchedNames] = useState<string[] | null>(null);
  const [pendingContacts, setPendingContacts] = useState<PendingContact[] | null>(null);

  useEffect(() => {
    setHasContactsApi(
      typeof navigator !== "undefined" && "contacts" in navigator
    );
    // Restore the matched-contacts step across a refresh — the OS picker
    // can't be replayed, but the names/contacts it already returned can be.
    try {
      const raw = sessionStorage.getItem(PENDING_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as { matchedNames: string[]; pendingContacts: PendingContact[] };
        if (saved.matchedNames?.length && saved.pendingContacts?.length) {
          setMatchedNames(saved.matchedNames);
          setPendingContacts(saved.pendingContacts);
        }
      }
    } catch {}
  }, []);

  function rememberPending(names: string[], contacts: PendingContact[]) {
    setMatchedNames(names);
    setPendingContacts(contacts);
    try { sessionStorage.setItem(PENDING_KEY, JSON.stringify({ matchedNames: names, pendingContacts: contacts })); } catch {}
  }

  function forgetPending() {
    try { sessionStorage.removeItem(PENDING_KEY); } catch {}
  }

  async function doImport(contacts: PendingContact[]) {
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/contacts/import`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ contacts }),
      });
      const json = await res.json();
      setResult(json.data ?? json);
      forgetPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.importError);
    } finally {
      setLoading(false);
    }
  }

  async function importAndroid() {
    setError("");
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = await (navigator as any).contacts.select(
        ["name", "tel", "email", "address"],
        { multiple: true }
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contacts: PendingContact[] = raw.map((c: any) => ({
        name: c.name?.[0] ?? "",
        phones: (c.tel ?? []) as string[],
        email: c.email?.[0] as string | undefined,
        city: c.address?.[0]?.city as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })).filter((c: any) => c.name && c.phones.length > 0);

      // T4: check who's already on Netai before the real import. Best-effort
      // — if the match call fails, just import straight away.
      try {
        const phones = contacts.flatMap((c) => c.phones);
        const matchRes = await fetch(`${BASE_URL}/profile/match-existing-contacts`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({ phones }),
        });
        const matchJson = await matchRes.json();
        const names: string[] = matchJson?.data?.names ?? matchJson?.names ?? [];
        if (matchRes.ok && names.length > 0) {
          rememberPending(names, contacts);
          setLoading(false);
          return;
        }
      } catch {}

      await doImport(contacts);
    } catch (err) {
      setError(err instanceof Error ? err.message : s.importError);
      setLoading(false);
    }
  }

  async function importVcf(file: File) {
    setError("");
    setLoading(true);
    try {
      const vcfContent = await file.text();
      const res = await fetch(`${BASE_URL}/contacts/import-vcf`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ vcfContent }),
      });
      const json = await res.json();
      setResult(json.data ?? json);
      forgetPending();
    } catch (err) {
      setError(err instanceof Error ? err.message : s.importError);
    } finally {
      setLoading(false);
    }
  }

  if (matchedNames && pendingContacts) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="card w-full max-w-sm p-8 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <h1 style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>{s.alreadyHereTitle}</h1>
            <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.alreadyHereBody}</p>
          </div>
          <ul className="flex flex-col gap-2">
            {matchedNames.map((name) => (
              <li
                key={name}
                className="flex items-center gap-2.5 px-3 py-2"
                style={{ background: "var(--sidebar-bg)", borderRadius: "var(--radius-tile)" }}
              >
                <span className="initial-avatar" style={{ width: 28, height: 28, fontSize: "12px" }}>
                  {name.charAt(0).toUpperCase()}
                </span>
                <span style={{ fontSize: "14px", color: "var(--ink)" }}>{name}</span>
              </li>
            ))}
          </ul>
          <button
            onClick={() => doImport(pendingContacts)}
            disabled={loading}
            className="btn-primary h-12"
          >
            {loading ? <Spinner /> : s.continueImport}
          </button>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
        <div className="card w-full max-w-sm p-8 flex flex-col items-center gap-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ background: "var(--accent-tint)" }}>
            <svg className="h-7 w-7" style={{ color: "var(--accent)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold" style={{ color: "var(--ink)" }}>{s.uploaded}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)" }}>
              {s.added}: {result.imported} &nbsp;&middot;&nbsp; {s.skipped}: {result.skipped}
            </p>
          </div>
          <button onClick={() => router.replace("/chat")} className="btn-primary w-full h-12">
            {s.start}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center px-4" style={{ background: "var(--bg)" }}>
      <div className="card w-full max-w-sm p-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 style={{ font: "500 22px/28px var(--font-bricolage)", color: "var(--ink)" }}>{s.title}</h1>
          <p className="text-sm" style={{ color: "var(--ink-soft)" }}>{s.body}</p>
        </div>

        {error && (
          <div
            className="px-4 py-3 text-sm"
            style={{ background: "var(--terra-tint)", color: "var(--danger)", borderRadius: "var(--radius-tile)" }}
          >
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {hasContactsApi ? (
            <button onClick={importAndroid} disabled={loading} className="btn-primary h-12">
              {loading ? (
                <Spinner />
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {s.shareContacts}
                </>
              )}
            </button>
          ) : (
            <label className="btn-primary h-12 cursor-pointer">
              {loading ? (
                <Spinner />
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  {s.uploadVcf}
                </>
              )}
              <input
                type="file"
                accept=".vcf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importVcf(file);
                }}
              />
            </label>
          )}

          <button
            type="button"
            onClick={() => { forgetPending(); skipOnboarding(); router.replace("/chat"); }}
            className="text-sm py-2 transition-colors hover:text-[var(--ink)]"
            style={{ color: "var(--ink-soft)" }}
          >
            {s.skip}
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}
