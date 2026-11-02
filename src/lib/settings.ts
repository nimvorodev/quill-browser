export type ReinkStyle = "notebook" | "serif" | "mono";
export type PaperTone = "default" | "sepia";
/** "original" = the real site (shielded). "reader" = re-inked. "live" = direct iframe. */
export type DefaultPageView = "original" | "reader" | "live";

export interface Settings {
  engine: string;
  shields: boolean;
  blockSocial: boolean;
  blockMiners: boolean;
  stripParams: boolean;
  strictSandbox: boolean;
  httpsOnly: boolean;
  noReferrer: boolean;
  ghostDefault: boolean;
  doh: boolean;
  fingerprint: boolean;
  blockAutoplay: boolean;
  theme: "day" | "night";
  home: string;
  showBookmarkBar: boolean;
  saveHistory: boolean;
  ambient: boolean;
  fontStep: number;
  defaultView: DefaultPageView;
  reinkStyle: ReinkStyle;
  paperTone: PaperTone;
  showImages: boolean;
  restoreSession: boolean;
  darkOriginal: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  engine: "google",
  shields: true,
  blockSocial: true,
  blockMiners: true,
  stripParams: true,
  strictSandbox: true,
  httpsOnly: true,
  noReferrer: true,
  ghostDefault: false,
  doh: false,
  fingerprint: true,
  blockAutoplay: true,
  theme: "day",
  home: "quill://start",
  showBookmarkBar: true,
  saveHistory: true,
  ambient: true,
  fontStep: 0,
  defaultView: "original",
  reinkStyle: "notebook",
  paperTone: "default",
  showImages: true,
  restoreSession: true,
  darkOriginal: false,
};

export type ToggleDef = {
  key: keyof Settings;
  label: string;
  icon: string;
  note: string;
  real: boolean;
};

export const TOGGLES: ToggleDef[] = [
  { key: "shields", label: "Shields up", icon: "shield", note: "Run every URL & page resource through the filter list.", real: true },
  { key: "stripParams", label: "Scrub URL trackers", icon: "scissors", note: "Strip utm_*, fbclid, gclid, msclkid & 40+ tracking params.", real: true },
  { key: "blockSocial", label: "Block social widgets", icon: "smile", note: "Embedded Facebook, X, TikTok, Pinterest & LinkedIn widgets. Visiting those sites still works.", real: true },
  { key: "blockMiners", label: "Block crypto miners", icon: "flame", note: "CoinHive & friends that steal your CPU.", real: true },
  { key: "httpsOnly", label: "HTTPS-only", icon: "lock", note: "Rewrite http:// navigations to https:// (except localhost).", real: true },
  { key: "noReferrer", label: "Strip referrer", icon: "eyeOff", note: "Sites never learn where you came from.", real: true },
  { key: "strictSandbox", label: "Strict frame sandbox", icon: "split", note: "Framed pages get an opaque origin: no access to Quill storage.", real: true },
  { key: "blockAutoplay", label: "No autoplay", icon: "stop", note: "Media must wait for a click before it starts.", real: true },
  { key: "saveHistory", label: "Write history", icon: "history", note: "Turn off and nothing gets written to disk.", real: true },
  { key: "ghostDefault", label: "Ghost by default", icon: "ghost", note: "Every new tab opens in ghost mode.", real: true },
  { key: "fingerprint", label: "Fingerprint noise", icon: "target", note: "Advisory: no canvas/font fingerprinting is done by Quill itself.", real: false },
  { key: "doh", label: "Encrypted DNS", icon: "antenna", note: "Route DNS lookups through Cloudflare's encrypted DoH · desktop app, restart to apply", real: true },
  { key: "ambient", label: "Ambient doodles", icon: "palette", note: "Floating ink sketches behind the chrome.", real: true },
];
