"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, pickArray, recordItems, isRecord } from "@/lib/payload";

// Facts by date (15 Sept). Ticket [5]'s done-when asks that the founder's
// seat can list facts by date. The route existed and the screen did not, so
// the only way to read it was curl, which is not something Tornike will run.
//
// THIS SCREEN LISTS AND NOTHING ELSE. The route it calls can also delete, on
// dry_run: false, and those are real records about real people. Deleting is a
// change to data and needs Tornike's own recorded consent (D44), so the button
// is deliberately absent rather than disabled: a disabled button is a promise
// that the decision has been made and merely not granted yet, and no such
// decision exists. Reading needs no permission; acting from the same screen
// does. If that ever changes it gets asked for out loud, not assumed here.
//
// dry_run is sent explicitly as true on every call. It already defaults to
// true on the server, but a default is the server's choice to change and this
// screen must not depend on it staying that way.

type Row = {
  id?: number | string | null;
  // Last four digits only (D149). The full number never leaves the server and
  // is never asked for.
  contact_last4?: string | null;
  field_type?: string | null;
  value?: string | null;
  is_public?: boolean | null;
  created_at?: string | null;
};

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  // An unreadable value prints raw; the dash is reserved for null.
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function AdminFactsPage() {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [after, setAfter] = useState("");
  const [before, setBefore] = useState("");
  const [rows, setRows] = useState<Row[] | null>(null);
  const [matched, setMatched] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = async () => {
    if (!userId.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<unknown>("/admin/facts/retract-range", {
        method: "POST",
        admin: true,
        body: {
          user_id: userId.trim(),
          ...(after ? { created_after: after } : {}),
          ...(before ? { created_before: before } : {}),
          dry_run: true,
        },
      });
      const body = isRecord(unwrapData(res)) ? (unwrapData(res) as Record<string, unknown>) : {};
      setRows(recordItems(pickArray(body, ["rows"])) as Row[]);
      setMatched(typeof body.matched === "number" ? body.matched : null);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
        router.replace("/admin/login");
        return;
      }
      setError(err instanceof ApiError ? err.message : "ჩატვირთვა ვერ მოხერხდა");
      setRows(null);
      setMatched(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <a href="/admin" className="text-sm text-gray-400 transition hover:text-gray-600">← ადმინი</a>
        <h1 className="text-lg font-bold text-[#23261F]">ფაქტები თარიღით</h1>
      </header>

      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-6">
        <p className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-xs text-gray-500">
          ეს ეკრანი მხოლოდ კითხულობს. აქედან წაშლა არ ხდება და ღილაკიც განზრახ არ არის.
          ფაქტების გაუქმება ნამდვილ ადამიანებზე ნამდვილ ჩანაწერებს ეხება, ამიტომ ცალკე გადაწყვეტილებას საჭიროებს.
        </p>

        <form
          onSubmit={(e) => { e.preventDefault(); search(); }}
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500">მომხმარებლის id</span>
            <input
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="w-40 rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#23261F]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500">თარიღიდან</span>
            <input
              type="date"
              value={after}
              onChange={(e) => setAfter(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#23261F]"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-semibold text-gray-500">თარიღამდე</span>
            <input
              type="date"
              value={before}
              onChange={(e) => setBefore(e.target.value)}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm text-[#23261F]"
            />
          </label>
          <button
            type="submit"
            disabled={loading || !userId.trim()}
            className="rounded-xl bg-[#23261F] px-5 py-2 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {loading ? "ვეძებ" : "ძებნა"}
          </button>
        </form>

        {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600 whitespace-pre-wrap">{error}</div>}

        {rows != null && (
          <>
            <p className="text-sm text-gray-500">
              ნაპოვნია <b className="text-[#23261F]">{matched ?? rows.length}</b> ჩანაწერი
            </p>

            {rows.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-400">ამ ფანჯარაში ჩანაწერი არ არის</p>
            ) : (
              <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500">
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">ვის შესახებ</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">ტიპი</th>
                      <th className="px-4 py-2.5 font-semibold">მნიშვნელობა</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">ხილვადობა</th>
                      <th className="whitespace-nowrap px-4 py-2.5 font-semibold">დაემატა</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id ?? i} className="border-b border-gray-50 last:border-0">
                        {/* Only the last four digits ever arrive here. */}
                        <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-gray-500">
                          {r.contact_last4 ? `…${r.contact_last4}` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-gray-600">{r.field_type ?? "—"}</td>
                        <td className="px-4 py-2.5 text-[#23261F] break-words">{r.value ?? "—"}</td>
                        <td className="whitespace-nowrap px-4 py-2.5">
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                            r.is_public ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-500"
                          }`}>
                            {r.is_public ? "საჯარო" : "დახურული"}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-2.5 text-xs text-gray-400">{fmt(r.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
