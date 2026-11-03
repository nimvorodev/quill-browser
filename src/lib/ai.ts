export type Msg = { role: "system" | "user" | "assistant"; content: string };

export type ProviderId =
  | "scribe" | "openai" | "openrouter" | "groq" | "together" | "mistral"
  | "deepseek" | "xai" | "ollama" | "lmstudio" | "custom";

export interface Provider {
  id: ProviderId;
  name: string;
  base: string;
  models: string[];
  needsKey: boolean;
  local?: boolean;
  tagline: string;
}

export const PROVIDERS: Provider[] = [
  { id: "scribe", name: "Quill Scribe", base: "", models: ["scribe-extractive"], needsKey: false, local: true, tagline: "Built-in, runs in this tab. Zero network, zero keys. Summarises & analyses any page." },
  { id: "ollama", name: "Ollama (local)", base: "http://localhost:11434/v1", models: ["llama3.2", "llama3.1:8b", "qwen2.5:7b", "mistral", "phi3"], needsKey: false, local: true, tagline: "Your own machine. Run `ollama serve` and pull any model." },
  { id: "lmstudio", name: "LM Studio (local)", base: "http://localhost:1234/v1", models: ["local-model"], needsKey: false, local: true, tagline: "Local GGUF server — enable CORS in LM Studio." },
  { id: "openai", name: "OpenAI", base: "https://api.openai.com/v1", models: ["gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "o4-mini"], needsKey: true, tagline: "The default. Key stays in localStorage on this device." },
  { id: "openrouter", name: "OpenRouter", base: "https://openrouter.ai/api/v1", models: ["openai/gpt-4o-mini", "anthropic/claude-3.5-sonnet", "google/gemini-flash-1.5", "meta-llama/llama-3.3-70b-instruct"], needsKey: true, tagline: "One key, hundreds of models from every lab." },
  { id: "groq", name: "Groq", base: "https://api.groq.com/openai/v1", models: ["llama-3.3-70b-versatile", "llama-3.1-8b-instant", "mixtral-8x7b-32768"], needsKey: true, tagline: "Absurdly fast inference." },
  { id: "together", name: "Together AI", base: "https://api.together.xyz/v1", models: ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Qwen/Qwen2.5-72B-Instruct-Turbo"], needsKey: true, tagline: "Open models, per-token pricing." },
  { id: "mistral", name: "Mistral", base: "https://api.mistral.ai/v1", models: ["mistral-small-latest", "mistral-large-latest", "open-mistral-nemo"], needsKey: true, tagline: "Paris-built frontier models." },
  { id: "deepseek", name: "DeepSeek", base: "https://api.deepseek.com/v1", models: ["deepseek-chat", "deepseek-reasoner"], needsKey: true, tagline: "Cheap reasoning, huge context." },
  { id: "xai", name: "xAI", base: "https://api.x.ai/v1", models: ["grok-2-latest", "grok-beta"], needsKey: true, tagline: "Grok via an OpenAI-shaped API." },
  { id: "custom", name: "Any OpenAI-compatible", base: "https://", models: ["my-model"], needsKey: false, tagline: "vLLM, llama.cpp server, Jan, KoboldCpp, Azure, a friend's box…" },
];

export interface AIConfig {
  provider: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  system: string;
  stream: boolean;
}

export const DEFAULT_AI: AIConfig = {
  provider: "scribe",
  baseUrl: "",
  apiKey: "",
  model: "scribe-extractive",
  temperature: 0.7,
  system:
    "You are the notebook assistant inside Quill, a hand-drawn private browser. Be concise, concrete and warm. Use plain markdown sparingly.",
  stream: true,
};

export function providerOf(id: ProviderId) {
  return PROVIDERS.find((p) => p.id === id) || PROVIDERS[0];
}

function friendly(err: unknown, cfg: AIConfig): string {
  const m = err instanceof Error ? err.message : String(err);
  if (/401|403|invalid.*key|incorrect api/i.test(m)) return "That API key was rejected. Check it in AI → Setup.";
  if (/404|model.*not/i.test(m)) return `Endpoint or model "${cfg.model}" not found on ${cfg.baseUrl}.`;
  if (/429/i.test(m)) return "Rate limited — the provider asked you to slow down.";
  if (/Failed to fetch|NetworkError|TypeError/i.test(m))
    return cfg.baseUrl.includes("localhost") || cfg.baseUrl.includes("127.0.0.1")
      ? `Couldn't reach ${cfg.baseUrl}. Start the server and enable CORS (Ollama: OLLAMA_ORIGINS=* ollama serve).`
      : `Network/CORS failure talking to ${cfg.baseUrl}.`;
  return m;
}

/** Streaming chat completion against any OpenAI-compatible /chat/completions endpoint. */
export async function streamChat(
  cfg: AIConfig,
  msgs: Msg[],
  onToken: (t: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  if (cfg.provider === "scribe") {
    const out = scribe(msgs);
    let shown = "";
    for (let i = 0; i < out.length; i += 4) {
      // Abort must leave only what was actually streamed — the caller saves
      // the return value as the final message.
      if (signal?.aborted) return shown;
      const piece = out.slice(i, i + 4);
      shown += piece;
      onToken(piece);
      await new Promise((r) => setTimeout(r, 12));
    }
    return shown;
  }

  const base = cfg.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "Content-Type": "application/json",
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
      ...(cfg.provider === "openrouter"
        ? { "HTTP-Referer": location.origin, "X-Title": "Quill browser" }
        : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      messages: msgs,
      temperature: cfg.temperature,
      stream: cfg.stream,
    }),
  }).catch((e) => {
    throw new Error(friendly(e, cfg));
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 240);
    throw new Error(friendly(new Error(`${res.status} ${res.statusText} ${detail}`), cfg));
  }

  if (!cfg.stream || !res.body) {
    const j = await res.json();
    const txt = j?.choices?.[0]?.message?.content ?? j?.message?.content ?? "(empty reply)";
    onToken(txt);
    return txt;
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("data:")) continue;
      const payload = s.slice(5).trim();
      if (payload === "[DONE]") return full;
      try {
        const j = JSON.parse(payload);
        const piece = j?.choices?.[0]?.delta?.content ?? j?.choices?.[0]?.text ?? j?.message?.content ?? "";
        if (piece) {
          full += piece;
          onToken(piece);
        }
      } catch {}
    }
  }
  return full;
}

export async function probeModels(cfg: AIConfig, signal?: AbortSignal): Promise<string[]> {
  const base = cfg.baseUrl.replace(/\/+$/, "");
  const res = await fetch(`${base}/models`, {
    signal,
    headers: cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {},
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const j = await res.json();
  const list = Array.isArray(j?.data) ? j.data : Array.isArray(j?.models) ? j.models : [];
  return list
    .map((m: any) => m?.id || m?.name || m?.model)
    .filter(Boolean)
    .slice(0, 300);
}

/* ------------------------------------------------------------------ */
/* Quill Scribe — a genuinely useful offline analyst, no network at all */
/* ------------------------------------------------------------------ */

const STOP = new Set(
  "the a an and or but if of to in on for with as by at from is are was were be been being it its this that these those there here not no you your we our they them he she his her i me my will would can could should may might must have has had do does did about into over under more most than then so such which who whom what when where why how all any both each few other some only own same too very s t just don now".split(" "),
);

function sentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'“])/)
    .map((s) => s.trim())
    .filter((s) => s.split(" ").length > 4 && s.length < 400);
}

function keywords(text: string, n = 12) {
  const freq = new Map<string, number>();
  for (const w of text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) || []) {
    if (STOP.has(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
}

function numbers(text: string) {
  return [...new Set(text.match(/\b\d[\d,.\-–%/]{1,20}\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2},?\s+\d{4}|\b\d{4}\b/gi) || [])].slice(0, 18);
}

function pageContext(msgs: Msg[]): { text: string; question: string } {
  const last = [...msgs].reverse().find((m) => m.role === "user")?.content || "";
  const m = last.match(/<<<PAGE\b[^>]*>>>\n?([\s\S]*?)\n?<<<\/PAGE>>>/);
  return { text: (m ? m[1] : "").trim(), question: last.replace(m ? m[0] : "", "").trim() };
}

export function scribe(msgs: Msg[]): string {
  const { text, question } = pageContext(msgs);
  const q = question.toLowerCase();

  if (!text) {
    return `I'm the **built-in Scribe** — I run entirely inside this tab, no key, no network.\n\nI work on *pages*, so give me one:\n\n- Open a site, press the ✂ Reader button, then ask me to summarise.\n- Or set up a real model in **AI → Setup**: Ollama / LM Studio (local), OpenAI, OpenRouter, Groq, Together, Mistral, DeepSeek, xAI, or any OpenAI-compatible URL.\n\nYour question was: “${question || "…"}”`;
  }

  const sents = sentences(text);
  const kw = keywords(text, 10);
  const kwSet = new Set(kw.map((k) => k[0]));
  const words = text.split(/\s+/).filter(Boolean).length;

  if (/summar|tl;dr|shorten|gist/.test(q)) {
    const scored = sents
      .map((s, i) => {
        const toks = s.toLowerCase().match(/[a-z']{3,}/g) || [];
        const hits = toks.filter((t) => kwSet.has(t)).length;
        return { s, score: hits / Math.sqrt(toks.length + 1) + 6 / (i + 6) };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 7);
    const picks = sents.filter((s) => scored.some((p) => p.s === s)).slice(0, 7);
    return `**Scribe's gist** — ${words.toLocaleString()} words boiled down:\n\n${picks.map((p) => `- ${p}`).join("\n")}\n\n_Recurring words: ${kw.slice(0, 6).map((k) => k[0]).join(", ")}. Fully offline, nothing was sent anywhere._`;
  }
  if (/key ?fact|number|stat|data|figure/.test(q)) {
    const facts = numbers(text);
    const who = [...new Set((text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2}\b/g) || []))].slice(0, 10);
    return `**Facts pulled out mechanically:**\n\n- Numbers & dates: ${facts.length ? facts.map((f) => `\`${f}\``).join(", ") : "none found"}\n- Named entities: ${who.length ? who.join(", ") : "none obvious"}\n- Vocabulary: ${kw.slice(0, 8).map((k) => `${k[0]} (${k[1]}×)`).join(", ")}\n\n_Ask a real model for judgement; I only do extraction._`;
  }
  if (/keyword|key topic|main topic|what (is|'s) this (page|about)|topics?\b/.test(q)) {
    return `**What this page is about, by word weight:**\n\n${kw.map((k) => `- **${k[0]}** — ${k[1]} occurrences`).join("\n")}`;
  }
  if (/read|level|grade|complex/.test(q)) {
    const avgWords = words / Math.max(sents.length, 1);
    const longS = sents.filter((s) => s.split(" ").length > 25).length;
    const grade = Math.max(4, Math.min(18, Math.round(0.39 * avgWords + 11.8 * 0.1 - 15.59 + 8)));
    return `**Readability (rough, local):**\n\n- ${words.toLocaleString()} words, ${sents.length} sentences\n- ${avgWords.toFixed(1)} words per sentence\n- ${longS} sentences over 25 words\n- Estimated reading time: ${Math.max(1, Math.round(words / 220))} min\n- School grade: ~${grade}\n- Feel: ${avgWords > 22 ? "dense — worth a skim first" : avgWords > 14 ? "normal prose" : "punchy and light"}`;
  }
  if (/simplif|eli5|explain|12 years|child/.test(q)) {
    const simple = sents
      .map((s) => ({ s, score: (s.toLowerCase().match(/[a-z']{3,}/g) || []).filter((t) => kwSet.has(t)).length / Math.sqrt(s.length / 40 + 1) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map((x) => x.s);
    return `**Like you're 12:**\n\n${simple.map((s) => `- ${s}`).join("\n")}\n\n_Main idea words: ${kw.slice(0, 5).map((k) => k[0]).join(", ")}._`;
  }

  const best = sents
    .map((s) => {
      const ql = q.replace(/[^a-z0-9 ]/g, "").split(" ").filter((w) => w.length > 3 && !STOP.has(w));
      const hit = ql.filter((w) => s.toLowerCase().includes(w)).length;
      return { s, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit)
    .slice(0, 5);

  return `**What the page says that matches “${question.slice(0, 60)}”:**\n\n${
    best.length ? best.map((b) => `- ${b.s}`).join("\n") : "- Nothing in the text answers that directly."
  }\n\nTop vocabulary on the page: ${kw.slice(0, 6).map((k) => k[0]).join(", ")}.\n\n_I'm the offline Scribe — I extract, I don't reason. Hook up Ollama or any OpenAI-compatible endpoint in **AI → Setup** for real answers._`;
}
