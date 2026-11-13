"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, Check, Circle, Download, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import type { IntakeReply } from "@/lib/contract";
import { moneyExact } from "@/lib/format";

type Msg = { from: "bot" | "me"; text: string };

const FIELDS: { key: string; label: string }[] = [
  { key: "amount", label: "Amount you sent" },
  { key: "paid_at", label: "When you paid" },
  { key: "channel", label: "How they reached you" },
  { key: "receiving account", label: "Account you paid" },
];

export function ReportChat() {
  const [sid, setSid] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [reply, setReply] = useState<IntakeReply | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [packetReady, setPacketReady] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const begin = useCallback(async () => {
    setError(null);
    try {
      const r = await api.startIntake();
      setSid(r.session_id);
      setReply(r);
      setMsgs([{ from: "bot", text: r.reply }]);
    } catch {
      setError("We could not reach the Rastro engine. Check that it is running, then try again.");
    }
  }, []);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    begin();
  }, [begin]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, busy]);

  // After the report is done, wait for the PDF to exist.
  useEffect(() => {
    if (!reply?.done || !reply.case_id) return;
    let stop = false;
    const id = reply.case_id;
    (async () => {
      for (let i = 0; i < 30 && !stop; i++) {
        try {
          const c = await api.case(id);
          if (c.packet_url || c.status === "linked" || c.status === "standalone" || c.status === "needs_review") {
            setPacketReady(true);
            return;
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 1200));
      }
      setPacketReady(true);
    })();
    return () => { stop = true; };
  }, [reply?.done, reply?.case_id]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t || !sid || busy || reply?.done) return;
    setText("");
    setBusy(true);
    setError(null);
    setMsgs((m) => [...m, { from: "me", text: t }]);
    try {
      const r = await api.sendIntake(sid, t);
      setReply(r);
      setMsgs((m) => [...m, { from: "bot", text: r.reply }]);
    } catch {
      setError("That message did not send. Please try again.");
      setText(t);
      setMsgs((m) => m.slice(0, -1));
    } finally {
      setBusy(false);
    }
  }

  const missing = new Set(reply?.missing_fields ?? FIELDS.map((f) => f.key));
  const draft = reply?.draft;
  const detail: Record<string, string | undefined> = {
    amount: draft?.amount ? moneyExact(draft.amount) : undefined,
    paid_at: draft?.urgency ? `${Math.round(draft.urgency.hours_since_payment)} h ago` : undefined,
    channel: draft?.channel,
  };
  const done = !!reply?.done;

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      {/* Chat */}
      <section aria-label="Report chat" className="flex min-h-[520px] flex-col rounded-2xl border border-line bg-raised">
        <div className="flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite">
          {msgs.length === 0 && !error && <p className="text-sm text-muted">Starting…</p>}
          {msgs.map((m, i) => (
            <div key={i} className={`flex ${m.from === "me" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed ${
                m.from === "me" ? "rounded-br-md bg-fg text-bg" : "rounded-bl-md border border-line bg-bg"
              }`}>{m.text}</p>
            </div>
          ))}
          {busy && (
            <div className="flex"><span className="inline-flex items-center gap-1.5 rounded-2xl rounded-bl-md border border-line bg-bg px-4 py-3 text-muted">
              <Loader2 className="size-4 animate-spin" /> <span className="text-sm">Reading your message</span>
            </span></div>
          )}
          {reply?.flagged && (
            <p className="rounded-xl bg-p2-bg px-4 py-3 text-sm text-p2">
              Part of your message looked like instructions to an AI. Rastro treats it as evidence and ignores it.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-xl bg-p1-bg px-4 py-3 text-sm text-p1">
              {error} {!sid && <button onClick={begin} className="underline">Try again</button>}
            </p>
          )}
          <div ref={bottom} />
        </div>
        <form onSubmit={send} className="flex items-end gap-2 border-t border-line p-3">
          <label htmlFor="answer" className="sr-only">Your answer</label>
          <textarea
            id="answer"
            rows={2}
            value={text}
            disabled={!sid || busy || done}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder={done ? "Your report is filed." : "Type your answer"}
            className="min-h-[52px] flex-1 resize-none rounded-xl border border-line-strong bg-bg px-4 py-3 text-[15px] outline-none focus:border-accent disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={!text.trim() || busy || done || !sid}
            aria-label="Send"
            className="grid size-[52px] place-items-center rounded-xl bg-fg text-bg transition-transform hover:-translate-y-px active:translate-y-0 disabled:opacity-40"
          >
            <ArrowUp className="size-5" />
          </button>
        </form>
      </section>

      {/* Progress and packet */}
      <aside className="flex flex-col gap-4">
        <div className="rounded-2xl border border-line p-5">
          <h2 className="text-sm font-semibold">What we have so far</h2>
          <ul className="mt-3 divide-y divide-line">
            <li className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
              <span className="flex items-center gap-2">
                {draft?.scam_type && draft.scam_type.label !== "unknown" ? <Check className="size-4 text-good" /> : <Circle className="size-4 text-faint" />}
                What happened
              </span>
              <span className="text-sm text-muted">{draft?.scam_type && draft.scam_type.label !== "unknown" ? draft.scam_type.label : ""}</span>
            </li>
            {FIELDS.map((f) => {
              const have = reply ? !missing.has(f.key) : false;
              return (
                <li key={f.key} className="flex items-center justify-between gap-3 py-2.5 text-[15px]">
                  <span className="flex items-center gap-2">
                    {have ? <Check className="size-4 text-good" /> : <Circle className="size-4 text-faint" />}
                    {f.label}
                  </span>
                  <span className="text-sm text-muted tabular">{have ? detail[f.key] ?? "" : ""}</span>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={`rounded-2xl p-5 ${done ? "border border-line-strong bg-raised" : "border border-dashed border-line-strong"}`}>
          <h2 className="text-sm font-semibold">Your evidence packet</h2>
          {!done && <p className="mt-2 text-sm text-muted">It unlocks when the details above are filled in. It is a PDF you can give to your bank.</p>}
          {done && (
            <div className="mt-2 flex flex-col gap-3">
              <p className="text-sm text-muted">Report <span className="font-mono text-fg">{reply?.case_id}</span> is filed.</p>
              {!packetReady && <p className="flex items-center gap-2 text-sm text-muted"><Loader2 className="size-4 animate-spin" /> Preparing your packet</p>}
              {packetReady && reply?.case_id && (
                <>
                  <a
                    href={api.packetUrl(reply.case_id)}
                    className="inline-flex items-center justify-center gap-2 rounded-full bg-fg px-5 py-2.5 text-sm font-medium text-bg transition-transform hover:-translate-y-px"
                  >
                    <Download className="size-4" /> Download the PDF packet
                  </a>
                  <Link href="/console" className="text-center text-sm text-muted underline-offset-4 hover:text-fg hover:underline">
                    See how fraud teams will view this report
                  </Link>
                </>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
