import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { CAT_LABEL, CAT_COLOR, RULE_COUNT, type Category } from "../lib/filters";
import { TOGGLES, type Settings } from "../lib/settings";
import { desktop } from "../lib/platform";
import { hostOf } from "../lib/nav";
import type { Tab } from "../lib/store";

/** Friendly names for the permissions a site can ask for. */
const PERM_LABEL: Record<string, string> = {
  media: "camera & microphone",
  geolocation: "location",
  notifications: "notifications",
  midi: "MIDI devices",
  "display-capture": "screen sharing",
  "clipboard-read": "clipboard reading",
};

function Switch({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative h-[20px] w-[38px] shrink-0 rounded-full border-2 border-ink transition-colors"
      style={{ background: on ? "var(--green)" : "var(--paper-3)" }}
      role="switch"
      aria-checked={on}
    >
      <span
        className="absolute top-[1.5px] h-[13px] w-[13px] rounded-full border border-ink bg-paper2 transition-all duration-200"
        style={{ left: on ? "20px" : "2px" }}
      />
    </button>
  );
}

export function PrivacyPanel({
  tab,
  settings,
  setSettings,
  blockedTotal,
  byCat,
  onClear,
  allow,
  deny,
  onAllow,
  onDeny,
  onRefetch,
  onBackup,
  onRestore,
  perms,
  onRevokePerm,
}: {
  tab: Tab;
  settings: Settings;
  setSettings: (f: (p: Settings) => Settings) => void;
  blockedTotal: number;
  byCat: Record<string, number>;
  onClear: (what: "history" | "bookmarks" | "notes" | "ai" | "all") => void;
  allow: string[];
  deny: string[];
  onAllow: (host: string) => void;
  onDeny: (host: string) => void;
  onRefetch?: () => void;
  /** Write settings + history + bookmarks + notes to a JSON file in Downloads. */
  onBackup?: () => void;
  /** Restore from a backup file the user picked. */
  onRestore?: (file: File) => void;
  /** Granted site permissions { host: [permission] } — the banner's "always allow". */
  perms?: Record<string, string[]>;
  onRevokePerm?: (host: string) => void;
}) {
  const [confirm, setConfirm] = useState<string | null>(null);
  // Erase buttons stay armed for 3s only — a stale "tap again" state must not
  // destroy data without a fresh double-tap.
  useEffect(() => {
    if (!confirm) return;
    const t = window.setTimeout(() => setConfirm(null), 3000);
    return () => window.clearTimeout(t);
  }, [confirm]);
  const maxCat = Math.max(1, ...Object.values(byCat));
  const host = tab.url.startsWith("quill://") ? "" : hostOf(tab.url);
  const audited = tab.article?.scanned ?? tab.blocked.length;

  return (
    <div className="no-scrollbar h-full space-y-5 overflow-y-auto px-4 py-4">
      <header>
        <h2 className="text-[38px] leading-none" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          <span className="marker" style={{ ["--hl" as any]: "var(--lime)" }}>the shield ledger</span>
        </h2>
        <p className="mt-1 text-[15px] italic text-ink2">
          every tracker, pixel, script &amp; query param Quill stripped — {RULE_COUNT} rules loaded.
        </p>
      </header>

      {/* Site permissions granted from the prompt banner. */}
      {perms && Object.keys(perms).length > 0 && (
        <section>
          <h3 className="mb-1 text-[15px] font-bold">site permissions</h3>
          <div className="ruled space-y-1 border-l-2 border-ink/20 pl-2">
            {Object.entries(perms).map(([h, list]) => (
              <div key={h} className="group flex items-center gap-2 py-[3px] text-[15px]">
                <span className="min-w-0 flex-1 truncate">
                  <b>{h}</b> <span className="text-ink3">· {list.map((p) => PERM_LABEL[p] || p).join(", ")}</span>
                </span>
                {onRevokePerm && (
                  <button onClick={() => onRevokePerm(h)} className="shrink-0 text-[13px] text-ink3 underline decoration-dotted hover:text-red">
                    revoke
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="hd grid grid-cols-3 divide-x-2 divide-dashed divide-ink/25 bg-paper2 ink-shadow">
        {[
          { n: blockedTotal.toLocaleString(), l: "total stripped", c: "var(--lime)" },
          { n: audited.toLocaleString(), l: "audited here", c: "var(--pink)" },
          { n: tab.blocked.length.toLocaleString(), l: "blocked here", c: "var(--cyan)" },
        ].map((s) => (
          <div key={s.l} className="px-3 py-2 text-center">
            <p className="text-[34px] leading-none tabular-nums" style={{ fontFamily: "var(--font-display)", fontWeight: 700, color: s.c }}>
              {s.n}
            </p>
            <p className="text-[13px] uppercase tracking-widest text-ink3">{s.l}</p>
          </div>
        ))}
      </div>

      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>by category</h3>
        <div className="space-y-1.5">
          {(Object.keys(CAT_LABEL) as Category[]).map((c) => {
            const on = c === "social" ? settings.blockSocial : c === "miners" ? settings.blockMiners : settings.shields;
            return (
              <div key={c} className="flex items-center gap-2">
                <span className="w-[150px] shrink-0 truncate text-[15px]">{CAT_LABEL[c]}</span>
                <span className="h-[13px] flex-1 overflow-hidden rounded-full border border-ink/30 bg-paper3">
                  <span
                    className="block h-full transition-all duration-700"
                    style={{ width: `${((byCat[c] || 0) / maxCat) * 100}%`, background: CAT_COLOR[c], opacity: on ? 1 : 0.35 }}
                  />
                </span>
                <span className="w-[42px] shrink-0 text-right text-[14px] tabular-nums text-ink2">{byCat[c] || 0}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>
          this page <span className="text-[15px] italic text-ink3">{host || "quill internal"}</span>
        </h3>
        <div className="hd max-h-[190px] overflow-y-auto bg-paper2 p-2 no-scrollbar">
          {tab.blocked.length === 0 && (
            <p className="p-2 text-[15px] italic text-ink3">
              nothing blocked here yet. Open a page in ✂ reader mode to see the full ledger.
            </p>
          )}
          {tab.blocked.slice(0, 200).map((b, i) => (
            <div key={i} className="flex items-center gap-2 border-b border-dashed border-ink/15 py-1 text-[13.5px] last:border-0">
              <span className="h-[9px] w-[9px] shrink-0 rotate-45 border border-ink" style={{ background: CAT_COLOR[b.cat] }} />
              <span className="w-[120px] shrink-0 truncate text-ink2">{CAT_LABEL[b.cat]}</span>
              {b.kind && (
                <span className="shrink-0 rounded border border-ink/25 bg-paper3/60 px-1 text-[10.5px] uppercase text-ink3">
                  {b.kind}
                </span>
              )}
              <code className="min-w-0 flex-1 truncate text-ink">{b.rule}</code>
              <span className="max-w-[34%] shrink-0 truncate text-ink3">{b.url}</span>
            </div>
          ))}
        </div>
        {host && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => onAllow(host)}
              className={[
                "hd-soft btn-sketch px-2.5 py-1 text-[15px]",
                allow.includes(host) ? "bg-red/20 text-red" : "bg-paper2 hover:bg-lime/40",
              ].join(" ")}
            >
              {allow.includes(host) ? `remove ${host} from allow-list` : `allow ${host} (no blocking)`}
            </button>
            <button
              onClick={() => onDeny(host)}
              className={[
                "hd-soft btn-sketch px-2.5 py-1 text-[15px]",
                deny.includes(host) ? "bg-ink text-paper" : "bg-paper2 hover:bg-red/30",
              ].join(" ")}
            >
              {deny.includes(host) ? `${host} is hard-blocked ✓` : `block ${host} entirely`}
            </button>
            {onRefetch && (
              <button
                onClick={onRefetch}
                className="hd-soft btn-sketch flex items-center gap-1 bg-yellow/60 px-2.5 py-1 text-[14.5px] text-[#1a2440] hover:bg-yellow"
              >
                <Icon name="reload" size={13} /> re-fetch &amp; re-audit
              </button>
            )}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>protection switches</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOGGLES.map((t) => {
            const on = Boolean(settings[t.key]);
            return (
              <div key={t.key} className="hd-soft flex items-start gap-2.5 bg-paper2 p-2.5">
                <span className="mt-[2px] text-ink2">
                  <Icon name={t.icon} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <b className="text-[16.5px] leading-tight">{t.label}</b>
                    {!t.real && (
                      <span className="rounded-full border border-ink/40 px-1.5 text-[11px] text-ink3" title="Quill can't enforce this from inside a web page">
                        advisory
                      </span>
                    )}
                  </span>
                  <span className="block text-[13.5px] italic leading-snug text-ink3">{t.note}</span>
                </span>
                <Switch
                  on={on}
                  onClick={() => {
                    setSettings((s) => ({ ...s, [t.key]: !on }));
                    // Desktop: persist the DoH flag for the main process to apply on next launch.
                    if (t.key === "doh") void desktop?.setDoh(!on);
                  }}
                />
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-[22px]" style={{ fontFamily: "var(--font-display)", fontWeight: 700 }}>erase things</h3>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["history", "history", "history"],
              ["bookmarks", "bookmarks", "book"],
              ["notes", "margin notes", "note"],
              ["ai", "AI chats & keys", "spark"],
              ["all", "everything", "trash"],
            ] as const
          ).map(([k, label, icon]) => (
            <button
              key={k}
              onClick={() => (confirm === k ? (onClear(k), setConfirm(null)) : setConfirm(k))}
              className={[
                "hd btn-sketch flex items-center gap-1.5 px-3 py-1 text-[15.5px]",
                confirm === k ? "bg-red text-white" : k === "all" ? "bg-paper2 hover:bg-red hover:text-white" : "bg-paper2 hover:bg-yellow",
              ].join(" ")}
            >
              <Icon name={icon} size={14} />
              {confirm === k ? "tap again — really?" : `erase ${label}`}
            </button>
          ))}
        </div>
        {(onBackup || onRestore) && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {onBackup && (
              <button onClick={onBackup} className="hd-soft btn-sketch flex items-center gap-1.5 bg-paper2 px-3 py-1 text-[15px] hover:bg-lime/40">
                <Icon name="download" size={14} /> back everything up
              </button>
            )}
            {onRestore && (
              <label className="hd-soft btn-sketch flex cursor-pointer items-center gap-1.5 bg-paper2 px-3 py-1 text-[15px] hover:bg-yellow">
                <Icon name="reload" size={14} /> restore a backup
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) onRestore(f);
                  }}
                />
              </label>
            )}
            <span className="text-[13px] italic text-ink3">settings · history · bookmarks · notes — one JSON file in Downloads</span>
          </div>
        )}
      </section>
    </div>
  );
}
