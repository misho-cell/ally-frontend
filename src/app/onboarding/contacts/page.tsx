"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type ImportResult = { imported: number; skipped: number };

export default function OnboardingContactsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState("");
  const [hasContactsApi, setHasContactsApi] = useState(false);

  useEffect(() => {
    setHasContactsApi(
      typeof navigator !== "undefined" && "contacts" in navigator
    );
  }, []);

  function getToken() {
    return typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : "";
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
      const contacts = raw.map((c: any) => ({
        name: c.name?.[0] ?? "",
        phones: (c.tel ?? []) as string[],
        email: c.email?.[0] as string | undefined,
        city: c.address?.[0]?.city as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })).filter((c: any) => c.name && c.phones.length > 0);

      const res = await fetch(`${BASE_URL}/contacts/import`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ contacts }),
      });
      const json = await res.json();
      setResult(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "კონტაქტების იმპორტი ვერ მოხერხდა");
    } finally {
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
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getToken()}`,
        },
        body: JSON.stringify({ vcfContent }),
      });
      const json = await res.json();
      setResult(json.data ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "კონტაქტების იმპორტი ვერ მოხერხდა");
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-[#1a1a2e] px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl flex flex-col items-center gap-5 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div>
            <p className="text-lg font-semibold text-[#1a1a2e]">კონტაქტები აიტვირთები!</p>
            <p className="mt-1 text-sm text-gray-500">
              დაემატა: {result.imported} &nbsp;&middot;&nbsp; გამოტოვებული: {result.skipped}
            </p>
          </div>
          <button
            onClick={() => router.replace("/chat")}
            className="w-full flex h-12 items-center justify-center rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white hover:opacity-90"
          >
            ჩეთის დაწყება
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#1a1a2e] px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl flex flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-bold text-[#1a1a2e]">კონტაქტების იმპორტი</h1>
          <p className="text-sm text-gray-500">
            Ally-ს დაეხმარება შენი კონტაქტების ანალიზისთვის.
          </p>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3">
          {hasContactsApi ? (
            <button
              onClick={importAndroid}
              disabled={loading}
              className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loading ? (
                <Spinner />
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  კონტაქტების გაზიარება
                </>
              )}
            </button>
          ) : (
            <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-[#1a1a2e] text-sm font-semibold text-white transition-opacity hover:opacity-90">
              {loading ? (
                <Spinner />
              ) : (
                <>
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  .vcf ფაილის ატვირთვა
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
            onClick={() => router.replace("/chat")}
            className="text-sm text-gray-400 hover:text-gray-600 py-2"
          >
            გამოტოვება
          </button>
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />;
}
