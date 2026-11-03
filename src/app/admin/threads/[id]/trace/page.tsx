"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { unwrapData, isRecord, type UnknownRecord } from "@/lib/payload";

// Backend 3 Nov 09:05Z, Misho: one conversation's whole path from the
// request to the response, for prompt debugging.
// GET /admin/threads/:id/trace?runs=N[&run_id=][&full=1][&with_prompt=1].
// The id here is a THREAD id, never a goal id.
// Read-only. Step and server-step names stay as the server spells them, so
// what is on screen can be searched for in the server's code and logs.

type Step = {
  at?: string;
  type?: string;
  text?: string;
  tool?: string;
  input?: string;
  is_error?: boolean;
};

type ServerStep = { at?: string; kind?: string; detail?: unknown };

type ToolCall = { tool?: string; ok?: boolean; duration_ms?: number | null; error?: string | null; at?: string };

type Cost = {
  kind?: string; model?: string; input_tokens?: number | null; output_tokens?: number | null; cost_usd?: number | null;
};

type RunTrace = {
  run_id?: string;
  started_at?: string;
  mode?: string;
  prompt_blocks?: string[];
  prompt_versions?: Record<string, number>;
  prompt_hashes?: string[];
  prompt_texts?: unknown;
  steps?: Step[];
  server_steps?: ServerStep[];
  tool_calls?: ToolCall[];
  costs?: Cost[];
};

// One merged timeline row. `seq` keeps the server's own order for rows that
// share a timestamp (or have none), so a sort never reshuffles them.
type Row =
  | { src: "step"; at: number; seq: number; step: Step }
  | { src: "server"; at: number; seq: number; step: ServerStep };

const RUN_CHOICES = [1, 3, 5, 10, 20];

function fmt(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
}

function atMs(iso?: string): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
}

function mergeTimeline(run: RunTrace): Row[] {
  const rows: Row[] = [];
  let seq = 0;
  for (const s of run.steps ?? []) rows.push({ src: "step", at: atMs(s.at), seq: seq++, step: s });
  for (const s of run.server_steps ?? []) rows.push({ src: "server", at: atMs(s.at), seq: seq++, step: s });
  return rows.sort((a, b) => (a.at === b.at ? a.seq - b.seq : a.at - b.at));
}

// Pretty-print when the text is JSON; otherwise leave it exactly as sent.
function pretty(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

function Collapsible({ label, text, tone = "gray" }: { label: string; text: string; tone?: "gray" | "red" }) {
  const box = tone === "red" ? "bg-red-50 text-red-800" : "bg-gray-50 text-gray-700";
  return (
    <details className="mt-1">
      <summary className="cursor-pointer select-none text-[11px] font-semibold text-gray-500">
        {label} <span className="font-normal text-gray-400">· {text.length.toLocaleString("en-US")} chars</span>
      </summary>
      <pre className={`mt-1 max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-lg px-3 py-2 font-mono text-[11px] ${box}`}>
        {pretty(text)}
      </pre>
    </details>
  );
}

const STEP_STYLE: Record<string, { dot: string; badge: string }> = {
  owner_line: { dot: "bg-[#3E7A56]", badge: "bg-green-50 text-green-800" },
  reasoning: { dot: "bg-violet-400", badge: "bg-violet-50 text-violet-700" },
  tool_call: { dot: "bg-sky-500", badge: "bg-sky-50 text-sky-700" },
  tool_result: { dot: "bg-sky-300", badge: "bg-sky-50 text-sky-700" },
  server_event: { dot: "bg-amber-400", badge: "bg-amber-50 text-amber-800" },
  caption: { dot: "bg-gray-300", badge: "bg-gray-100 text-gray-500" },
  text: { dot: "bg-[#23261F]", badge: "bg-gray-900 text-white" },
};

function StepRow({ step }: { step: Step }) {
  const type = step.type ?? "?";
  const style = STEP_STYLE[type] ?? { dot: "bg-gray-300", badge: "bg-gray-100 text-gray-600" };
  const errored = type === "tool_result" && step.is_error === true;
  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${errored ? "bg-red-500" : style.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${errored ? "bg-red-50 text-red-700" : style.badge}`}>
            {type}{errored ? " · is_error" : ""}
          </span>
          {step.tool && <span className="font-mono text-xs text-sky-700">{step.tool}</span>}
          <span className="text-[11px] text-gray-400">{fmt(step.at)}</span>
        </div>
        {type === "tool_call" ? (
          step.input != null && <Collapsible label="input" text={step.input} />
        ) : type === "tool_result" ? (
          step.text != null && <Collapsible label="result" text={step.text} tone={errored ? "red" : "gray"} />
        ) : step.text ? (
          <p className={`mt-0.5 whitespace-pre-wrap break-words text-sm ${
            type === "reasoning" ? "text-violet-800" : type === "caption" ? "text-xs text-gray-400" : "text-gray-800"
          }`}>
            {step.text}
          </p>
        ) : null}
      </div>
    </li>
  );
}

function detailText(v: unknown): string {
  if (v == null) return "—";
  return typeof v === "string" ? v : JSON.stringify(v, null, 2);
}

function ServerStepRow({ step }: { step: ServerStep }) {
  const kind = step.kind ?? "?";
  const d: UnknownRecord = isRecord(step.detail) ? step.detail : {};

  if (kind === "reply_dropped") {
    // The step nobody saw: a reply the server held back. It must stand out.
    return (
      <li className="flex gap-3">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-600" />
        <div className="min-w-0 flex-1 rounded-xl border-2 border-red-300 bg-red-50 px-3 py-2">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-full bg-red-600 px-2 py-0.5 font-mono text-[10px] font-semibold text-white">reply_dropped</span>
            <span className="text-[11px] text-red-400">{fmt(step.at)}</span>
          </div>
          <p className="mt-1 text-xs font-semibold text-red-800">reason: {detailText(d.reason)}</p>
          {d.reply != null && (
            <p className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-white px-3 py-2 text-sm text-gray-800">{detailText(d.reply)}</p>
          )}
        </div>
      </li>
    );
  }

  if (kind === "reply_rewritten") {
    return (
      <li className="flex gap-3">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-400" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="rounded-full bg-orange-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-orange-700">reply_rewritten</span>
            {d.by != null && <span className="font-mono text-xs text-orange-700">by {detailText(d.by)}</span>}
            <span className="text-[11px] text-gray-400">{fmt(step.at)}</span>
          </div>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-gray-50 px-3 py-2">
              <p className="font-mono text-[10px] font-semibold text-gray-400">before</p>
              <p className="whitespace-pre-wrap break-words text-sm text-gray-700">{detailText(d.before)}</p>
            </div>
            <div className="rounded-lg bg-orange-50 px-3 py-2">
              <p className="font-mono text-[10px] font-semibold text-orange-400">after</p>
              <p className="whitespace-pre-wrap break-words text-sm text-gray-800">{detailText(d.after)}</p>
            </div>
          </div>
        </div>
      </li>
    );
  }

  const isModel = kind === "model_call";
  const entries = Object.entries(d);
  return (
    <li className="flex gap-3">
      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gray-400" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2">
          <span className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold ${isModel ? "bg-indigo-50 text-indigo-700" : "bg-gray-100 text-gray-600"}`}>
            {kind}
          </span>
          <span className="text-[11px] text-gray-400">{fmt(step.at)}</span>
        </div>
        {entries.length > 0 ? (
          <div className="mt-1 flex flex-wrap gap-1.5">
            {entries.map(([k, v]) => (
              <span key={k} className="rounded-md bg-gray-50 px-1.5 py-0.5 font-mono text-[11px] text-gray-600">
                {k}: <span className="text-gray-900">{v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)}</span>
              </span>
            ))}
          </div>
        ) : step.detail != null ? (
          <p className="mt-0.5 whitespace-pre-wrap break-words font-mono text-[11px] text-gray-600">{detailText(step.detail)}</p>
        ) : null}
      </div>
    </li>
  );
}

// prompt_texts: the exact system prompt each model round was sent. The shape
// of one entry is not pinned down, so a string is shown as is and anything
// else as JSON. Absent (not asked for, or a run the server kept none for) is
// said differently from an empty list.
function PromptTexts({ value }: { value: unknown }) {
  if (value === undefined) return null;
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) {
    return <p className="text-xs text-gray-400">prompt_texts: []</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      {list.map((p, i) => {
        const text = typeof p === "string" ? p
          : isRecord(p) && typeof p.text === "string" ? p.text
          : JSON.stringify(p, null, 2);
        return <Collapsible key={i} label={`system prompt · round ${i + 1}`} text={text} />;
      })}
    </div>
  );
}

function RunCard({ run, threadId }: { run: RunTrace; threadId: string }) {
  const timeline = mergeTimeline(run);
  const toolCalls = run.tool_calls ?? [];
  const costs = run.costs ?? [];
  const costSum = costs.reduce((s, c) => s + (typeof c.cost_usd === "number" ? c.cost_usd : 0), 0);
  const versions = run.prompt_versions ?? {};
  const dropped = (run.server_steps ?? []).filter((s) => s.kind === "reply_dropped").length;

  return (
    <section className="flex flex-col gap-3 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-bold text-[#23261F]">{fmt(run.started_at)}</span>
        {run.mode && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 font-mono text-xs text-gray-700">{run.mode}</span>}
        {dropped > 0 && (
          <span className="rounded-full bg-red-600 px-2.5 py-0.5 font-mono text-xs font-semibold text-white">reply_dropped × {dropped}</span>
        )}
        {run.run_id && (
          <a
            href={`/admin/threads/${encodeURIComponent(threadId)}/trace?run_id=${encodeURIComponent(run.run_id)}`}
            className="ml-auto font-mono text-[11px] text-gray-400 hover:text-[#3E7A56] hover:underline"
            title={run.run_id}
          >
            {run.run_id.length > 12 ? `${run.run_id.slice(0, 12)}…` : run.run_id}
          </a>
        )}
      </div>

      {(run.prompt_blocks ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {(run.prompt_blocks ?? []).map((b) => (
            <a
              key={b}
              href={`/admin/prompt-blocks/${encodeURIComponent(b)}`}
              className="rounded-full bg-gray-50 px-2 py-0.5 font-mono text-[11px] text-gray-500 hover:bg-gray-100"
            >
              {b}{versions[b] != null ? ` v${versions[b]}` : ""}
            </a>
          ))}
        </div>
      )}
      {(run.prompt_hashes ?? []).length > 0 && (
        <p className="break-all font-mono text-[10px] text-gray-400">hashes: {(run.prompt_hashes ?? []).join(" · ")}</p>
      )}

      <PromptTexts value={run.prompt_texts} />

      {timeline.length > 0 ? (
        <ol className="flex flex-col gap-3">
          {timeline.map((r) =>
            r.src === "step"
              ? <StepRow key={`s${r.seq}`} step={r.step} />
              : <ServerStepRow key={`v${r.seq}`} step={r.step} />,
          )}
        </ol>
      ) : (
        <p className="text-xs text-gray-400">steps: []</p>
      )}

      {toolCalls.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-gray-100 font-mono text-[10px] text-gray-400">
              <tr><th className="px-3 py-2">tool_calls</th><th className="px-3 py-2">ok</th><th className="px-3 py-2">ms</th><th className="px-3 py-2">error</th></tr>
            </thead>
            <tbody>
              {toolCalls.map((t, i) => {
                const bad = t.ok === false || !!t.error;
                return (
                  <tr key={i} className={`border-b border-gray-50 last:border-0 ${bad ? "bg-red-50 text-red-700" : ""}`}>
                    <td className="px-3 py-1.5 font-mono">{t.tool ?? "—"}</td>
                    <td className="px-3 py-1.5">{t.ok === true ? "✓" : t.ok === false ? "✗" : "—"}</td>
                    <td className="px-3 py-1.5">{t.duration_ms ?? "—"}</td>
                    <td className="px-3 py-1.5 break-words">{t.error ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {costs.length > 0 && (
        <div className="flex flex-col gap-1">
          {costs.map((c, i) => (
            <p key={i} className="font-mono text-[11px] text-gray-500">
              {c.kind ?? "—"} · {c.model ?? "—"} · in {c.input_tokens ?? "—"} / out {c.output_tokens ?? "—"} · ${c.cost_usd ?? "—"}
            </p>
          ))}
          {costs.length > 1 && <p className="font-mono text-[11px] font-semibold text-gray-700">Σ ${costSum.toFixed(4)}</p>}
        </div>
      )}
    </section>
  );
}

export default function AdminThreadTracePage() {
  const router = useRouter();
  const params = useParams();
  const search = useSearchParams();
  const threadId = String(params.id);
  const runId = search.get("run_id") ?? "";
  const runsParam = Number(search.get("runs") ?? "5");
  const runs = RUN_CHOICES.includes(runsParam) ? runsParam : 5;
  const full = search.get("full") === "1";
  const withPrompt = search.get("with_prompt") === "1";

  // One result per request key. Loading is derived (the result on hand is for
  // another key), so nothing is set synchronously inside the effect. A failed
  // load is said as such, never as "no runs".
  const [nonce, setNonce] = useState(0);
  const key = `${threadId}|${runId}|${runs}|${full}|${withPrompt}|${nonce}`;
  const [result, setResult] = useState<{ key: string; runs: RunTrace[] | null; error: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams();
    if (runId) q.set("run_id", runId); else q.set("runs", String(runs));
    if (full) q.set("full", "1");
    if (withPrompt) q.set("with_prompt", "1");
    apiFetch<unknown>(`/admin/threads/${encodeURIComponent(threadId)}/trace?${q}`, { admin: true })
      .then((res) => {
        if (!alive) return;
        const d = unwrapData(res);
        const list = isRecord(d) && Array.isArray(d.runs) ? (d.runs as RunTrace[]) : null;
        setResult(list === null
          ? { key, runs: null, error: "unexpected response: no runs[]" }
          : { key, runs: list, error: null });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        // 401 is already sent to /admin/login by apiFetch. A 403 here is the
        // pilot reader being shut for a real person's conversation; its own
        // text says why, so it is shown, not treated as a logged-out admin.
        setResult({
          key, runs: null,
          error: err instanceof ApiError ? `${err.status ?? ""} ${err.message}`.trim() : "ჩატვირთვა ვერ მოხერხდა",
        });
      });
    return () => { alive = false; };
  }, [key, threadId, runId, runs, full, withPrompt]);

  const loading = result?.key !== key;
  const data = result?.runs ?? null;
  const error = loading ? null : result?.error ?? null;

  const go = (next: { runs?: number; full?: boolean; withPrompt?: boolean; runId?: string | null }) => {
    const q = new URLSearchParams();
    const rid = next.runId === undefined ? runId : next.runId ?? "";
    if (rid) q.set("run_id", rid);
    else q.set("runs", String(next.runs ?? runs));
    if (next.full ?? full) q.set("full", "1");
    if (next.withPrompt ?? withPrompt) q.set("with_prompt", "1");
    router.replace(`/admin/threads/${encodeURIComponent(threadId)}/trace?${q}`);
  };

  return (
    <div className="min-h-full bg-gray-50">
      <header className="flex flex-wrap items-center gap-3 border-b border-gray-200 bg-white px-6 py-4 shadow-sm">
        <a href="/admin" className="text-sm text-gray-400 transition hover:text-gray-600">← Admin</a>
        <h1 className="text-lg font-bold text-[#23261F]">trace · thread #{threadId}</h1>
      </header>

      <div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-6">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {runId ? (
            <>
              <span className="rounded-full bg-[#23261F] px-3 py-1 font-mono text-xs text-white">run_id {runId.slice(0, 12)}…</span>
              <button type="button" onClick={() => go({ runId: null })} className="text-xs text-[#3E7A56] hover:underline">
                ← runs={runs}
              </button>
            </>
          ) : (
            RUN_CHOICES.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => go({ runs: n })}
                className={`rounded-full px-3 py-1 font-mono text-xs transition-colors ${
                  n === runs ? "bg-[#23261F] text-white" : "border border-gray-200 text-[#23261F] hover:bg-gray-100"
                }`}
              >
                runs={n}
              </button>
            ))
          )}
          <label className="ml-2 inline-flex items-center gap-1.5 font-mono text-xs text-gray-600">
            <input type="checkbox" checked={full} onChange={(e) => go({ full: e.target.checked })} />
            full
          </label>
          <label className="inline-flex items-center gap-1.5 font-mono text-xs text-gray-600">
            <input type="checkbox" checked={withPrompt} onChange={(e) => go({ withPrompt: e.target.checked })} />
            with_prompt
          </label>
          <button type="button" onClick={() => setNonce((n) => n + 1)} className="ml-auto text-xs text-gray-500 hover:text-[#23261F]">განახლება</button>
        </div>

        {loading && data === null ? (
          <div className="flex justify-center py-12">
            <span className="h-6 w-6 animate-spin rounded-full border-2 border-gray-200 border-t-[#23261F]" />
          </div>
        ) : error ? (
          <div className="whitespace-pre-wrap rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        ) : data && data.length === 0 ? (
          <p className="py-8 text-center font-mono text-sm text-gray-400">runs: []</p>
        ) : (
          (data ?? []).map((run, i) => <RunCard key={run.run_id ?? i} run={run} threadId={threadId} />)
        )}
      </div>
    </div>
  );
}
