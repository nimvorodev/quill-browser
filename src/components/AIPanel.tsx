import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icons";
import {
  DEFAULT_AI, PROVIDERS, providerOf, probeModels, streamChat,
  type AIConfig, type Msg, type ProviderId,
} from "../lib/ai";
import { QUICK_PROMPTS } from "../lib/nav";
import { useLocal } from "../lib/store";

/* ---------- tiny handwritten markdown ---------- */
function inline(s: string, keyBase: string) {
  const parts: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(s))) {
    if (m.index > last) parts.push(s.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith("**")) parts.push(<strong key={k} className="font-bold" style={{ color: "var(--ink)" }}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith("`")) parts.push(<code key={k} className="rounded bg-paper3 px-1 text-[0.92em]" style={{ fontFamily: "ui-monospace,monospace" }}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith("[")) {
      const mm = tok.match(/\[([^\]]+)\]\(([^)]+)\)/)!;
      // Model output is untrusted: only http(s) links become clickable, so a
      // javascript: URL in a chat reply can never execute in Quill's origin.
      const href = mm[2].trim();
      if (/^https?:\/\//i.test(href)) {
        parts.push(<a key={k} href={href} target="_blank" rel="noreferrer noopener" className="text-cyan underline decoration-wavy underline-offset-2">{mm[1]}</a>);
      } else {
        parts.push(<span key={k}>{mm[1]}</span>);
      }
    } else parts.push(<em key={k} className="italic">{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < s.length) parts.push(s.slice(last));
  return parts;
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: ReactNode[] = [];
  let list: string[] = [];
  let code: string[] = [];
  let inCode = false;

  const flushList = (k: number) => {
    if (!list.length) return;
    out.push(
      <ul key={`ul${k}`} className="my-2 space-y-1">
        {list.map((l, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[0.6em] h-[6px] w-[6px] shrink-0 rotate-45 bg-pink" />
            <span>{inline(l, `l${k}-${i}`)}</span>
          </li>
        ))}
      </ul>,
    );
    list = [];
  };

  const flushCode = (k: number) => {
    if (!code.length) return;
    out.push(
      <pre
        key={`c${k}`}
        className="no-scrollbar my-2 overflow-x-auto border border-ink/40 bg-paper3/70 p-2 text-[13px]"
        style={{ fontFamily: "ui-monospace,monospace", borderRadius: "8px 2px 8px 2px" }}
      >
        {code.join("\n")}
      </pre>,
    );
    code = [];
  };

  lines.forEach((raw, idx) => {
    if (/^ {0,3}```/.test(raw)) {
      if (inCode) {
        flushCode(idx);
        inCode = false;
      } else {
        flushList(idx);
        inCode = true;
      }
      return;
    }
    if (inCode) {
      code.push(raw);
      return;
    }
    const h = raw.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushList(idx);
      out.push(
        <p key={idx} className="mt-3 mb-1 text-[19px] leading-tight" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          {inline(h[2], `h${idx}`)}
        </p>,
      );
      return;
    }
    const li = raw.match(/^\s*[-*•]\s+(.*)$/);
    if (li) {
      list.push(li[1]);
      return;
    }
    if (/^\s*\d+[.)]\s+/.test(raw)) {
      list.push(raw.replace(/^\s*\d+[.)]\s+/, ""));
      return;
    }
    flushList(idx);
    if (!raw.trim()) {
      out.push(<div key={idx} className="h-2" />);
      return;
    }
    out.push(<p key={idx} className="mb-1.5">{inline(raw, `p${idx}`)}</p>);
  });
  flushCode(lines.length);
  flushList(lines.length);
  return <>{out}</>;
}

/* ------------------------------------------------------------------ */

export function AIPanel({
  open,
  onClose,
  cfg,
  setCfg,
  page,
  queued,
  consumeQueued,
  resetNonce = 0,
  requestedTab = null,
}: {
  open: boolean;
  onClose: () => void;
  cfg: AIConfig;
  setCfg: (f: (p: AIConfig) => AIConfig) => void;
  page: { title: string; url: string; text: string } | null;
  queued: { text: string; ctxOverride?: string; at: number } | null;
  consumeQueued: () => void;
  resetNonce?: number;
  requestedTab?: { tab: "chat" | "setup"; at: number } | null;
}) {
  // chat lives in localStorage, but writes are debounced so streaming stays smooth
  const [messages, setMessages] = useState<Msg[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("quill.v1.ai.chat") || "[]") as Msg[];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem("quill.v1.ai.chat", JSON.stringify(messages.slice(-80)));
      } catch {}
    }, 400);
    return () => clearTimeout(t);
  }, [messages]);
  const [tab, setTab] = useState<"chat" | "setup">("chat");
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [includeCtx, setIncludeCtx] = useLocal<boolean>("ai.ctx", true);
  const [status, setStatus] = useState<string>("");
  const [probe, setProbe] = useState<string[]>([]);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);
  const [reveal, setReveal] = useState(false);
  const [stats, setStats] = useState({ ms: 0, chars: 0 });
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, busy]);

  const send = async (raw: string, ctxOverride?: string) => {
    const text = raw.trim();
    if (!text || busy) return;
    setErr(null);
    const ctx = ctxOverride !== undefined ? ctxOverride : includeCtx && page ? page.text : "";
    const apiMsgs: Msg[] = [
      { role: "system", content: cfg.system },
      ...messages.slice(-10),
      {
        role: "user",
        content: ctx
          ? `${text}\n\n<<<PAGE title="${page?.title || ""}" url="${page?.url || ""}">>>\n${ctx.slice(0, 24000)}\n<<</PAGE>>>`
          : text,
      },
    ];
    const withUser = [...messages, { role: "user" as const, content: text }];
    setMessages(withUser);
    setDraft("");
    setBusy(true);
    const ac = new AbortController();
    abort.current = ac;
    const t0 = performance.now();
    let acc = "";
    setMessages([...withUser, { role: "assistant", content: "" }]);
    try {
      await streamChat(cfg, apiMsgs, (tok) => {
        acc += tok;
        setStats({ ms: Math.round(performance.now() - t0), chars: acc.length });
        setMessages([...withUser, { role: "assistant", content: acc }]);
      }, ac.signal);
      setStats({ ms: Math.round(performance.now() - t0), chars: acc.length });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/abort/i.test(msg)) {
        setErr(msg);
        setMessages(withUser);
      }
    } finally {
      setBusy(false);
      abort.current = null;
      setStatus("");
    }
  };

  useEffect(() => {
    if (resetNonce > 0) {
      abort.current?.abort();
      setMessages([]);
      setErr(null);
      try {
        localStorage.removeItem("quill.v1.ai.chat");
      } catch {}
    }
  }, [resetNonce]);

  useEffect(() => {
    if (requestedTab) setTab(requestedTab.tab);
  }, [requestedTab]);

  useEffect(() => {
    if (queued && open) {
      setTab("chat");
      const override = queued.ctxOverride !== undefined ? queued.ctxOverride : page && includeCtx ? undefined : "";
      send(queued.text, override);
      consumeQueued();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queued, open]);

  const provider = providerOf(cfg.provider);

  if (!open) return null;

  return (
    <div className="slide-left flex h-full w-full flex-col border-l-2 border-ink bg-paper2/95 backdrop-blur">
      {/* header */}
      <div className="relative shrink-0 border-b-2 border-ink px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full border-2 border-ink bg-pink text-white">
            <Icon name="spark" size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[22px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
              margin AI
            </p>
            <p className="truncate text-[13px] text-ink3">
              {provider.name} · {cfg.model} {provider.local && !cfg.apiKey ? "· stays on this device" : ""}
            </p>
          </div>
          <button onClick={onClose} className="hd grid h-[28px] w-[28px] place-items-center bg-paper2 hover:bg-red hover:text-white" title="Close (Ctrl/Cmd+J)">
            <Icon name="close" size={14} strokeWidth={2.4} />
          </button>
        </div>
        <div className="mt-2 flex gap-1">
          {(["chat", "setup"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={[
                "hd-soft px-3 py-[2px] text-[15px] transition",
                tab === t ? "bg-yellow ink-shadow-sm" : "bg-paper3/40 hover:bg-paper3",
              ].join(" ")}
            >
              {t === "chat" ? "✎ chat" : "⚙ setup"}
            </button>
          ))}
          {messages.length > 0 && tab === "chat" && (
            <button
              onClick={() => setMessages([])}
              className="hd-soft ml-auto px-2.5 py-[2px] text-[14px] text-ink2 hover:bg-red/20 hover:text-red"
              title="Erase this conversation"
            >
              <Icon name="trash" size={13} /> erase
            </button>
          )}
        </div>
      </div>

      {tab === "chat" ? (
        <>
          {/* context strip */}
          <div className="shrink-0 border-b border-dashed border-ink/30 bg-paper3/40 px-3 py-1.5 text-[13.5px] text-ink2">
            <label className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={includeCtx} onChange={(e) => setIncludeCtx(e.target.checked)} className="accent-pink h-3.5 w-3.5" />
              {page ? (
                <span className="truncate">
                  attach <b className="text-ink">{page.title.slice(0, 46)}</b>{" "}
                  <em className="text-ink3">({page.text.split(/\s+/).length.toLocaleString()} words)</em>
                </span>
              ) : (
                <span className="italic text-ink3">no page open — chat is context-free (open a reader page to attach it)</span>
              )}
            </label>
          </div>

          {/* messages */}
          <div ref={boxRef} className="no-scrollbar flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="pt-6 text-center">
                <svg width="110" height="80" viewBox="0 0 110 80" className="mx-auto drift" style={{ ["--d" as any]: "7s" }}>
                  <path d="M10 62 C 30 18, 52 20, 66 44 S 94 66, 104 26" stroke="var(--violet)" strokeWidth="2.6" fill="none" strokeLinecap="round" />
                  <circle cx="104" cy="26" r="3.4" fill="var(--pink)" />
                  <path d="M8 70h94" stroke="var(--ink)" strokeOpacity=".2" strokeDasharray="5 7" strokeWidth="2" />
                </svg>
                <p className="mx-auto max-w-[240px] text-[17px] text-ink2" style={{ fontFamily: "var(--font-display)", fontSize: 26 }}>
                  ask me anything about the page
                </p>
                <p className="mx-auto mt-1 max-w-[260px] text-[14px] italic text-ink3">
                  The built-in <b>Scribe</b> works right now with no key and no network. Setup has ten more providers,
                  including local Ollama &amp; LM Studio.
                </p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : ""}>
                {m.role === "user" ? (
                  <div
                    className="sticky-shadow max-w-[88%] border border-ink/20 px-3 py-2 text-[16px] text-[#1a2440]"
                    style={{ background: "#fff2a8", transform: "rotate(-0.6deg)", borderRadius: "3px 10px 3px 10px" }}
                  >
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-full border-l-2 border-dashed border-ink/25 pl-3 text-[15.5px] leading-[1.6] text-ink">
                    {m.content ? (
                      <span className={busy && i === messages.length - 1 ? "pen-caret" : ""}>
                        <Markdown text={m.content} />
                      </span>
                    ) : (
                      <span className="text-ink3 italic">thinking<span className="pen-caret" /></span>
                    )}
                  </div>
                )}
              </div>
            ))}
            {err && (
              <div className="hd border-red bg-red/10 p-3 text-[15px] text-red">
                <b>couldn't reach the model —</b> {err}
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* quick prompts */}
          <div className="no-scrollbar flex shrink-0 gap-1.5 overflow-x-auto border-t border-dashed border-ink/25 px-3 py-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                onClick={() => send(q.prompt)}
                disabled={busy}
                className="hd-soft btn-sketch shrink-0 whitespace-nowrap bg-paper3/50 px-2.5 py-1 text-[14px] hover:bg-yellow/60 disabled:opacity-50"
              >
                <Icon name={q.icon} size={12} className="mr-1 inline" />
                {q.label}
              </button>
            ))}
          </div>

          {/* composer */}
          <div className="shrink-0 border-t-2 border-ink bg-paper3/30 p-2.5">
            {busy && (
              <p className="mb-1 text-[13px] text-ink3">
                {stats.ms}ms · {stats.chars.toLocaleString()} chars {status}
              </p>
            )}
            <div className="hd flex items-end gap-2 bg-paper2 p-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(draft);
                  }
                }}
                rows={Math.min(5, Math.max(1, draft.split("\n").length))}
                placeholder="write your question…  (Enter to send, Shift+Enter for a new line)"
                className="max-h-[120px] min-h-[38px] flex-1 bg-transparent px-1 py-1 text-[16.5px] placeholder:text-ink3/80"
              />
              {busy ? (
                <button onClick={() => abort.current?.abort()} className="hd btn-sketch grid h-[34px] w-[34px] shrink-0 place-items-center bg-red text-white" title="Stop">
                  <Icon name="stop" size={14} />
                </button>
              ) : (
                <button
                  onClick={() => send(draft)}
                  disabled={!draft.trim()}
                  className="hd btn-sketch grid h-[34px] w-[34px] shrink-0 place-items-center bg-pink text-white disabled:opacity-40"
                  title="Send"
                >
                  <Icon name="send" size={16} />
                </button>
              )}
            </div>
            <div className="mt-1.5 flex items-center justify-between px-1 text-[12.5px] text-ink3">
              <span>{provider.local ? "🔒 nothing leaves this machine" : `🔑 calls ${cfg.baseUrl || "—"}`}</span>
              <button
                onClick={() => {
                  const md = messages.map((m) => `**${m.role}:**\n\n${m.content}\n`).join("\n---\n\n");
                  const blob = new Blob([`# Quill AI chat\n\n${md}`], { type: "text/markdown" });
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(blob);
                  a.download = "quill-ai-chat.md";
                  a.click();
                  URL.revokeObjectURL(a.href);
                }}
                className="underline decoration-dotted hover:text-ink"
              >
                export chat
              </button>
            </div>
          </div>
        </>
      ) : (
        <div className="no-scrollbar flex-1 space-y-4 overflow-y-auto px-3 py-3">
          <div>
            <p className="mb-2 text-[19px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>pick a brain</p>
            <div className="grid gap-1.5">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setCfg((c) => ({ ...c, provider: p.id as ProviderId, baseUrl: p.base || c.baseUrl, model: c.provider === p.id ? c.model : p.models[0] }))}
                  className={[
                    "hd-soft flex items-start gap-2.5 p-2 text-left transition",
                    cfg.provider === p.id ? "bg-yellow ink-shadow-sm" : "bg-paper2 hover:bg-paper3/60",
                  ].join(" ")}
                >
                  <span
                    className="mt-[3px] grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border-2 border-ink text-[12px]"
                    style={{ background: p.local ? "var(--lime)" : "var(--cyan)" }}
                  >
                    {p.local ? "🏠" : "☁"}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[16.5px] leading-tight">{p.name}</span>
                    <span className={["block text-[13.5px] italic leading-snug", cfg.provider === p.id ? "text-[#1a2440]/75" : "text-ink3"].join(" ")}>{p.tagline}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          {cfg.provider !== "scribe" && (
            <>
              <Field label="base URL">
                <input
                  value={cfg.baseUrl}
                  onChange={(e) => setCfg((c) => ({ ...c, baseUrl: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                  className="w-full bg-transparent px-2 py-1.5 text-[15px]"
                  spellCheck={false}
                />
              </Field>
              <Field label="API key" hint={provider.needsKey ? "stored in localStorage on this device only" : "optional"}>
                <div className="flex items-center">
                  <input
                    type={reveal ? "text" : "password"}
                    value={cfg.apiKey}
                    onChange={(e) => setCfg((c) => ({ ...c, apiKey: e.target.value }))}
                    placeholder={provider.needsKey ? "sk-…" : "leave blank for local servers"}
                    className="w-full bg-transparent px-2 py-1.5 text-[15px]"
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button onClick={() => setReveal((r) => !r)} className="px-2 text-ink2 hover:text-ink" title={reveal ? "Hide" : "Show"}>
                    <Icon name={reveal ? "eyeOff" : "eye"} size={16} />
                  </button>
                </div>
              </Field>
              <Field label="model">
                <div className="flex items-center gap-2">
                  <input
                    list="quill-models"
                    value={cfg.model}
                    onChange={(e) => setCfg((c) => ({ ...c, model: e.target.value }))}
                    className="w-full bg-transparent px-2 py-1.5 text-[15px]"
                    spellCheck={false}
                  />
                  <datalist id="quill-models">
                    {(probe.length ? probe : provider.models).map((m) => <option key={m} value={m} />)}
                  </datalist>
                  <button
                    onClick={async () => {
                      setProbeMsg("asking…");
                      try {
                        const list = await probeModels(cfg);
                        setProbe(list);
                        setProbeMsg(`✓ ${list.length} models found`);
                        if (list.length && !list.includes(cfg.model)) setCfg((c) => ({ ...c, model: list[0] }));
                      } catch (e) {
                        setProbeMsg(`✗ ${e instanceof Error ? e.message : "failed"}`);
                      }
                    }}
                    className="hd btn-sketch shrink-0 bg-paper2 px-2 py-1 text-[14px] hover:bg-cyan"
                  >
                    fetch list
                  </button>
                </div>
                {probeMsg && <p className="mt-1 px-2 text-[13px] text-ink3">{probeMsg}</p>}
                {probe.length > 0 && (
                  <div className="no-scrollbar mt-1.5 flex max-h-[74px] flex-wrap gap-1 overflow-y-auto px-1">
                    {probe.slice(0, 40).map((m) => (
                      <button
                        key={m}
                        onClick={() => setCfg((c) => ({ ...c, model: m }))}
                        className={[
                          "hd-soft px-1.5 py-[1px] text-[12.5px]",
                          cfg.model === m ? "bg-lime" : "bg-paper3/50 hover:bg-paper3",
                        ].join(" ")}
                      >
                        {m.length > 30 ? m.slice(0, 30) + "…" : m}
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field label={`temperature · ${cfg.temperature.toFixed(2)}`}>
                <input
                  type="range" min={0} max={1.6} step={0.05} value={cfg.temperature}
                  onChange={(e) => setCfg((c) => ({ ...c, temperature: Number(e.target.value) }))}
                  className="w-full accent-pink px-2"
                />
              </Field>
              <Field label="system prompt">
                <textarea
                  value={cfg.system}
                  onChange={(e) => setCfg((c) => ({ ...c, system: e.target.value }))}
                  rows={3}
                  className="w-full bg-transparent px-2 py-1.5 text-[14.5px] leading-snug"
                />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex cursor-pointer items-center gap-2 text-[15px]">
                  <input type="checkbox" checked={cfg.stream} onChange={(e) => setCfg((c) => ({ ...c, stream: e.target.checked }))} className="h-3.5 w-3.5 accent-pink" />
                  stream tokens
                </label>
                <button
                  onClick={() => send("Say hello in one short sentence and tell me which model you are.", "")}
                  className="hd btn-sketch ml-auto flex items-center gap-1.5 bg-lime px-3 py-1 text-[15.5px]"
                >
                  <Icon name="zap" size={14} /> test connection
                </button>
              </div>
              <button
                onClick={() => setCfg(() => ({ ...DEFAULT_AI }))}
                className="hd-soft w-full px-3 py-1.5 text-[15px] text-ink2 hover:bg-paper3/60"
              >
                reset AI settings to defaults
              </button>
            </>
          )}

          {cfg.provider === "scribe" && (
            <div className="hd bg-lime/20 p-3 text-[15px] text-ink2">
              <b className="text-ink">Quill Scribe</b> is a small extractive engine that lives in this tab: it scores sentences by
              keyword weight, pulls out numbers, entities and readability stats. No key, no request, no telemetry. Great for
              summarising; hopeless at reasoning — for that, pick a local or hosted model above.
            </div>
          )}

          <div className="hd bg-paper3/50 p-3 text-[14px] leading-relaxed text-ink2">
            <p className="mb-1 flex items-center gap-1.5 text-[16px] text-ink">
              <Icon name="lock" size={14} /> privacy notes
            </p>
            <p>· Your key sits in <code className="rounded bg-paper2 px-1">localStorage</code> and is only ever sent to the base URL you typed.</p>
            <p>· Local servers (Ollama / LM Studio / vLLM) must allow CORS. For Ollama: <code className="rounded bg-paper2 px-1">OLLAMA_ORIGINS=* ollama serve</code>.</p>
            <p>· Page context is only attached when the checkbox in the chat tab is on.</p>
            <p>· Erasing AI data in Settings removes chats, keys and configs instantly.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 flex items-baseline gap-2 px-1 text-[15px] text-ink2">
        <b className="text-ink" style={{ fontFamily: "var(--font-display)", fontSize: 19 }}>{label}</b>
        {hint && <em className="text-[12.5px] text-ink3">{hint}</em>}
      </span>
      <span className="hd block bg-paper2">{children}</span>
    </label>
  );
}
