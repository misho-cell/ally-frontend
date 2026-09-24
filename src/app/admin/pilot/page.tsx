"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { isRecord, pickArray, recordItems, unwrapData } from "@/lib/payload";
import PilotThreadsCard from "@/components/PilotThreadsCard";

// Row 16 (24 Sept). Reading a pilot user's conversation already worked, but
// only from the admin page of a user whose id you already had. The reading
// routes take a user_id and nothing answered "whose" — so in practice the
// feature was reachable only by someone who had gone looking for an id in the
// user list first, which is not reading the pilot, it is remembering it.
//
// GET /admin/pilot/people answers that question. This screen is the list and
// the reader in one place: pick a person, their conversations open below.

type Person = {
  id?: number | string | null;
  user_id?: number | string | null;
  name?: string | null;
  phone?: string | null;
  registered_at?: string | null;
  // How many days since this person registered.
  day?: number | string | null;
  threads?: number | string | null;
  goals?: number | string | null;
  // Billed by Stripe, and let in by an admin. Two facts, never one: a
  // hand-granted account is a person using the product and is not revenue.
  paying?: boolean | null;
  granted_by_hand?: boolean | null;
  last_active_at?: string | null;
};

// The endpoint is young and the field names were not pinned, so the id is
// read under either spelling. Anything else and the row cannot be opened,
// which the row says rather than rendering a button that does nothing.
function personId(p: Person): string | null {
  const v = p.user_id ?? p.id;
  return v == null || v === "" ? null : String(v);
}

function count(v: number | string | null | undefined): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function fmt(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  // An unreadable date is not a missing date. Print what came rather than
  // dropping it, so a bad format shows up as a bad format.
  return isNaN(d.getTime()) ? iso : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminPilotPage() {
  const router = useRouter();
  const [people, setPeople] = useState<Person[] | null>(null);
  // The server's own count, shown beside the rows. If it ever disagrees with
  // how many rows arrived, that disagreement is worth seeing rather than
  // hiding behind a list that looks complete.
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async (stillWanted: () => boolean = () => true) => {
    try {
      const res = await apiFetch<unknown>("/admin/pilot/people", { admin: true });
      if (!stillWanted()) return;
      // 24 Sept: this read `res` directly and never unwrapped the envelope,
      // so with the list at data.people it found nothing and drew the empty
      // state — "nobody is in the pilot yet" over a 200 carrying 48 people.
      // A screen that reports an empty list and a screen that failed to find
      // the list must not look the same, and this one did.
      const body = unwrapData(res);
      setPeople(recordItems(pickArray(body, ["people"])) as Person[]);
      setTotal(isRecord(body) && typeof body.total === "number" ? body.total : null);
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/admin/login");
        return;
      }
      if (!stillWanted()) return;
      // A 403 here is the pilot reader gate, not a fault: another admin, or
      // the pilot is over. It says which, because "you may not" and "it
      // broke" send a person to two different places.
      setError(
        err instanceof ApiError && err.status === 403
          ? "ამ ანგარიშს პილოტის კითხვის უფლება არ აქვს"
          : err instanceof ApiError
            ? err.message
            : "ჩატვირთვა ვერ მოხერხდა"
      );
      setPeople([]);
      setTotal(null);
    }
  }, [router]);

  useEffect(() => {
    let alive = true;
    // The rule cannot see across the function boundary and assumes load()
    // sets state synchronously. It does not: nothing is written before the
    // first await, and every write after it is behind the liveness check.
    // Narrowed to this line rather than the file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(() => alive);
    return () => { alive = false; };
  }, [load]);

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <div className="flex items-center gap-3">
          <a href="/admin" className="text-sm text-gray-400 transition hover:text-gray-600">← ადმინი</a>
          <h1 className="text-lg font-bold text-[#23261F]">პილოტის ხალხი</h1>
          {total != null && <span className="text-xs text-gray-500">სულ {total}</span>}
        </div>
        <button
          type="button"
          onClick={() => load()}
          className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-600 transition hover:bg-gray-50"
        >
          განახლება
        </button>
      </header>

      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {people === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : people.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-400">
            {error ? "სია ვერ ჩაიტვირთა" : "პილოტში ჯერ არავინ არის"}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {people.map((p, i) => {
              const pid = personId(p);
              const threads = count(p.threads);
              const goals = count(p.goals);
              const seen = fmt(p.last_active_at);
              const open = pid != null && pid === openId;
              return (
                <div key={pid ?? i} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex flex-wrap items-baseline gap-2">
                    {/* A blank name and a missing name are different facts. */}
                    <h2 className="text-sm font-bold text-[#23261F]">
                      {p.name?.trim() ? p.name : p.name === null || p.name === undefined ? "სახელი არ მოსულა" : "უსახელო ანგარიში"}
                    </h2>
                    {p.phone && <span className="font-mono text-xs text-gray-400">…{String(p.phone).slice(-4)}</span>}
                    {/* Zero conversations is a fact about this person; an
                        absent count is a fact about the payload. */}
                    {threads != null ? (
                      <span className="text-xs text-gray-500">{threads} საუბარი</span>
                    ) : (
                      <span className="text-xs text-gray-400">საუბრების რაოდენობა არ მოსულა</span>
                    )}
                    {goals != null && <span className="text-xs text-gray-500">{goals} მიზანი</span>}
                    {p.day != null && <span className="text-xs text-gray-400">დღე {String(p.day)}</span>}
                    {/* Two separate facts, drawn separately. */}
                    {p.paying === true && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-700">იხდის</span>
                    )}
                    {p.granted_by_hand === true && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600" title="ადმინმა მისცა წვდომა, შემოსავალი არაა">
                        ხელით მიცემული
                      </span>
                    )}
                    {seen && <span className="text-xs text-gray-400">ბოლოს: {seen}</span>}
                    {pid == null ? (
                      <span className="ml-auto text-xs text-gray-400">id არ მოსულა, გახსნა ვერ ხერხდება</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setOpenId(open ? null : pid)}
                        className="ml-auto rounded-xl border border-gray-200 px-3 py-1.5 text-xs text-gray-600 transition hover:bg-gray-50"
                      >
                        {open ? "დახურვა" : "საუბრები"}
                      </button>
                    )}
                  </div>

                  {open && pid != null && (
                    <div className="mt-4 border-t border-gray-100 pt-4">
                      {/* The reader is the same component the user page uses.
                          Two readings of one conversation would be two places
                          for it to be wrong. */}
                      <PilotThreadsCard userId={pid} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
