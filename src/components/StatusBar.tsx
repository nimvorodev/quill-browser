import { useEffect, useState } from "react";
import { Icon } from "./Icons";
import { TIPS, ENGINES, type SearchEngine } from "../lib/nav";
import { useNow } from "../lib/store";

export function StatusBar({
  blockedTotal,
  tabBlocked,
  ghost,
  shieldsOn,
  engine,
  secure,
  view,
  host,
  onOpenShields,
  onToggleShields,
}: {
  blockedTotal: number;
  tabBlocked: number;
  ghost: boolean;
  shieldsOn: boolean;
  engine: SearchEngine;
  secure: boolean;
  view: string;
  host: string;
  onOpenShields: () => void;
  onToggleShields: () => void;
}) {
  const now = useNow(20000);
  const [tip, setTip] = useState(0);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setTip((v) => (v + 1) % TIPS.length), 9000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (tabBlocked > 0) {
      setPulse(true);
      const t = setTimeout(() => setPulse(false), 600);
      return () => clearTimeout(t);
    }
  }, [tabBlocked]);

  const otherEngines = ENGINES.filter((e) => e.id !== engine.id).length;

  return (
    <div className="relative z-20 flex h-[34px] shrink-0 items-center gap-3 border-t-2 border-ink bg-paper3/80 px-3 text-[14px] text-ink2">
      <button
        onClick={onOpenShields}
        className={[
          "hd-soft btn-sketch flex items-center gap-1.5 bg-paper2 px-2 py-[1px] transition",
          pulse ? "shake" : "",
        ].join(" ")}
        style={shieldsOn ? { borderColor: "var(--green)" } : { borderColor: "var(--red)" }}
        title="Open the shield ledger"
      >
        <Icon name={shieldsOn ? "shield" : "shieldOff"} size={14} />
        <span className="font-bold" style={{ color: shieldsOn ? "var(--green)" : "var(--red)" }}>
          {blockedTotal.toLocaleString()}
        </span>
        <span className="hidden sm:inline">blocked</span>
        {tabBlocked > 0 && (
          <span className="rounded-full bg-pink px-1.5 text-[12px] font-bold text-white">+{tabBlocked} here</span>
        )}
      </button>

      <button
        onClick={onToggleShields}
        className="hidden items-center gap-1 hover:text-ink md:flex"
        title="Toggle shields everywhere"
      >
        <span
          className="relative inline-block h-[16px] w-[30px] rounded-full border-2 border-ink transition"
          style={{ background: shieldsOn ? "var(--green)" : "var(--paper)" }}
        >
          <span
            className="absolute top-[1px] h-[10px] w-[10px] rounded-full bg-paper2 transition-all"
            style={{ left: shieldsOn ? "16px" : "2px" }}
          />
        </span>
        shields {shieldsOn ? "on" : "off"}
      </button>

      <span className="hidden items-center gap-1 lg:flex">
        <Icon name={secure ? "lock" : "globe"} size={13} />
        {host || "—"}
      </span>

      <span className="hidden items-center gap-1 xl:flex">
        <Icon name="search" size={13} />
        {engine.name}
        <em className="text-ink3">(+{otherEngines} more)</em>
      </span>

      {ghost && (
        <span className="flex items-center gap-1 text-violet">
          <Icon name="ghost" size={14} /> ghost tab — nothing is being written down
        </span>
      )}

      <span key={tip} className="rise ml-auto hidden max-w-[42%] truncate italic text-ink3 md:block">
        ✎ {TIPS[tip]}
      </span>

      <span className="ml-auto flex items-center gap-2 md:ml-0">
        <span className="hidden sm:inline">{view}</span>
        <span className="tabular-nums">
          {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
      </span>
    </div>
  );
}
