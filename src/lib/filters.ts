export type Category = "ads" | "trackers" | "social" | "popups" | "miners";

export type BlockKind = "network" | "script" | "iframe" | "pixel" | "inline" | "cosmetic" | "param" | "navigation";

export const CAT_LABEL: Record<Category, string> = {
  ads: "Ad networks",
  trackers: "Trackers & analytics",
  social: "Social widgets",
  popups: "Pop-ups & redirectors",
  miners: "Crypto miners",
};

export const CAT_COLOR: Record<Category, string> = {
  ads: "var(--orange)",
  trackers: "var(--pink)",
  social: "var(--violet)",
  popups: "var(--red)",
  miners: "var(--cyan)",
};

export interface FilterOptions {
  shields?: boolean;
  blockSocial?: boolean;
  blockMiners?: boolean;
  stripParams?: boolean;
  allow?: string[];
  deny?: string[];
}

type Rule = [string, Category];

/** Domain rules — matched against the hostname and every parent domain. */
const DOMAINS: Rule[] = [
  // ad exchanges / networks
  ["doubleclick.net", "ads"], ["googlesyndication.com", "ads"], ["googleadservices.com", "ads"],
  ["adnxs.com", "ads"], ["adsrvr.org", "ads"], ["rubiconproject.com", "ads"], ["pubmatic.com", "ads"],
  ["openx.net", "ads"], ["casalemedia.com", "ads"], ["criteo.com", "ads"], ["criteo.net", "ads"],
  ["taboola.com", "ads"], ["outbrain.com", "ads"], ["amazon-adsystem.com", "ads"], ["moatads.com", "ads"],
  ["serving-sys.com", "ads"], ["yieldmo.com", "ads"], ["indexww.com", "ads"], ["3lift.com", "ads"],
  ["bidswitch.net", "ads"], ["smartadserver.com", "ads"], ["adform.net", "ads"], ["contextweb.com", "ads"],
  ["adroll.com", "ads"], ["media.net", "ads"], ["revcontent.com", "ads"], ["mgid.com", "ads"],
  ["adblade.com", "ads"], ["zergnet.com", "ads"], ["sharethrough.com", "ads"], ["sovrn.com", "ads"],
  ["gumgum.com", "ads"], ["undertone.com", "ads"], ["sonobi.com", "ads"], ["spotxchange.com", "ads"],
  ["stickyadstv.com", "ads"], ["teads.tv", "ads"], ["imrworldwide.com", "ads"], ["innovid.com", "ads"],
  ["adcolony.com", "ads"], ["unityads.unity3d.com", "ads"], ["applovin.com", "ads"], ["vungle.com", "ads"],
  ["inmobi.com", "ads"], ["mopub.com", "ads"], ["flurry.com", "ads"], ["admob.com", "ads"],
  ["zedo.com", "ads"], ["tribalfusion.com", "ads"], ["atwola.com", "ads"], ["advertising.com", "ads"],
  ["mathtag.com", "ads"], ["adtechus.com", "ads"], ["btrll.com", "ads"], ["eyeviewads.com", "ads"],
  ["admarketplace.com", "ads"], ["revjet.com", "ads"], ["celtra.com", "ads"], ["sizmek.com", "ads"],
  ["2mdn.net", "ads"], ["adition.com", "ads"], ["adlightning.com", "ads"], ["adsafeprotected.com", "ads"],
  ["DoubleVerify.com".toLowerCase(), "ads"], ["doubleverify.com", "ads"], ["kargo.com", "ads"], ["nativo.com", "ads"],
  ["connatix.com", "ads"], ["primis.tech", "ads"], ["jwpltx.com", "ads"], ["carbonads.com", "ads"],
  ["buysellads.com", "ads"], ["ethicalads.io", "ads"],
  // data brokers / retargeting
  ["krxd.net", "trackers"], ["demdex.net", "trackers"], ["everesttech.net", "trackers"],
  ["bluekai.com", "trackers"], ["exelator.com", "trackers"], ["rlcdn.com", "trackers"],
  ["agkn.com", "trackers"], ["tapad.com", "trackers"], ["id5-sync.com", "trackers"],
  ["liveramp.com", "trackers"], ["adsymptotic.com", "trackers"], ["owneriq.net", "trackers"],
  ["turn.com", "trackers"], ["liadm.com", "trackers"], ["rezync.com", "trackers"],
  ["permutive.com", "trackers"], ["cxense.com", "trackers"], ["crwdcntrl.net", "trackers"],
  ["lotame.com", "trackers"], ["pippio.com", "trackers"], ["zeotap.com", "trackers"],
  // analytics / measurement / consent trackers
  ["google-analytics.com", "trackers"], ["googletagmanager.com", "trackers"],
  ["googletagservices.com", "trackers"], ["scorecardresearch.com", "trackers"], ["quantserve.com", "trackers"],
  ["adobedtm.com", "trackers"], ["omtrdc.net", "trackers"], ["2o7.net", "trackers"],
  ["mixpanel.com", "trackers"], ["segment.io", "trackers"], ["segment.com", "trackers"],
  ["amplitude.com", "trackers"], ["hotjar.com", "trackers"], ["fullstory.com", "trackers"],
  ["crazyegg.com", "trackers"], ["mouseflow.com", "trackers"], ["clarity.ms", "trackers"],
  ["newrelic.com", "trackers"], ["nr-data.net", "trackers"], ["chartbeat.com", "trackers"],
  ["parsely.com", "trackers"], ["matomo.cloud", "trackers"], ["heapanalytics.com", "trackers"],
  ["kissmetrics.com", "trackers"], ["optimizely.com", "trackers"], ["vwo.com", "trackers"],
  ["luckyorange.com", "trackers"], ["bounceexchange.com", "trackers"], ["bugsnag.com", "trackers"],
  ["sentry.io", "trackers"], ["datadoghq.com", "trackers"], ["mparticle.com", "trackers"],
  ["braze.com", "trackers"], ["onesignal.com", "trackers"], ["pushwoosh.com", "trackers"],
  ["branch.io", "trackers"], ["adjust.com", "trackers"], ["appsflyer.com", "trackers"],
  ["kochava.com", "trackers"], ["crittercism.com", "trackers"], ["localytics.com", "trackers"],
  ["fpjscdn.net", "trackers"], ["fpnpmcdn.net", "trackers"], ["iperceptions.com", "trackers"],
  ["gigya.com", "trackers"], ["qualtrics.com", "trackers"], ["mediametrics.ru", "trackers"],
  ["bat.bing.com", "trackers"], ["stats.wp.com", "trackers"], ["pixel.wp.com", "trackers"],
  ["cookielaw.org", "trackers"], ["onetrust.com", "trackers"], ["cookiebot.com", "trackers"],
  ["trustarc.com", "trackers"], ["quantcast.com", "trackers"], ["fundingchoicesmessages.google.com", "trackers"],
  ["tinypass.com", "trackers"], ["piano.io", "trackers"], ["cloudflareinsights.com", "trackers"],
  // marketing / chat capture
  ["hs-scripts.com", "trackers"], ["hubspot.com", "trackers"], ["pardot.com", "trackers"],
  ["marketo.net", "trackers"], ["drift.com", "trackers"], ["intercom.io", "trackers"],
  ["zdassets.com", "trackers"], ["zopim.com", "trackers"], ["livechatinc.com", "trackers"],
  ["olark.com", "trackers"], ["tidio.co", "trackers"], ["tawk.to", "trackers"],
  // social widgets & social pixels
  ["facebook.net", "social"], ["connect.facebook.net", "social"], ["fbcdn.net", "social"],
  ["platform.twitter.com", "social"], ["syndication.twitter.com", "social"], ["ads-twitter.com", "social"],
  ["static.ads-twitter.com", "social"], ["t.co", "social"], ["analytics.tiktok.com", "social"],
  ["sc-static.net", "social"], ["ct.pinterest.com", "social"], ["addthis.com", "social"],
  ["sharethis.com", "social"], ["snap.licdn.com", "social"], ["widgets.wp.com", "social"],
  ["disqus.com", "social"], ["disquscdn.com", "social"],
  // pop-under / redirect / malvertising
  ["popads.net", "popups"], ["popcash.net", "popups"], ["propellerads.com", "popups"],
  ["exoclick.com", "popups"], ["juicyads.com", "popups"], ["adcash.com", "popups"],
  ["hilltopads.net", "popups"], ["adsterra.com", "popups"], ["clickadu.com", "popups"],
  ["runative-syndicate.com", "popups"], ["yllix.com", "popups"], ["onclickads.net", "popups"],
  ["pushance.com", "popups"], ["zog.link", "popups"], ["adf.ly", "popups"], ["ouo.io", "popups"],
  // crypto miners
  ["coinhive.com", "miners"], ["coin-hive.com", "miners"], ["cryptoloot.pro", "miners"],
  ["jsecoin.com", "miners"], ["coinimp.com", "miners"], ["webmine.cz", "miners"],
  ["minero.cc", "miners"], ["authedmine.com", "miners"], ["crypto-loot.com", "miners"],
];

/** Path rules — matched against the whole URL. */
const PATHS: [RegExp, Category][] = [
  [/\/(ad|ads|adv)\/(?!block)/i, "ads"],
  [/[?&]ad(z|slot|unit|server|_domain|_provider|_type)?=/i, "ads"],
  [/duckduckgo\.com\/y\.js/i, "ads"],
  [/bing\.com\/aclick/i, "ads"],
  [/googleadservices\.com\/pagead\/aclk/i, "ads"],
  [/\/(banner|banners)\//i, "ads"],
  [/\/sponsor(ed)?[-_/]/i, "ads"],
  [/\/show_ads\.js/i, "ads"],
  [/\/adsbygoogle/i, "ads"],
  [/\/gpt\/|\/prebid/i, "ads"],
  [/\/vast\.xml|\/vpaid\//i, "ads"],
  [/\/pagead\/(js|lvz|conversion|adview)/i, "ads"],
  [/\/(ga|analytics|gtag|gtm|matomo|piwik)(\.min)?\.js/i, "trackers"],
  [/\/fbevents\.js|\/fbq\(/i, "social"],
  [/\/(track|pixel|beacon|telemetry|collect)(\/|\?|\.gif|\.png|\.js)/i, "trackers"],
  [/\/heatmap.*\.js/i, "trackers"],
  [/\/1x1\.(gif|png)|\/spacer\.gif/i, "trackers"],
  [/\/pop(-|_)?under/i, "popups"],
  [/\/interstitial\//i, "popups"],
  [/\/(miner|cryptonight)\.js/i, "miners"],
  [/\/webassembly.*miner/i, "miners"],
];

/** Known URL tracking parameters stripped from navigations & extracted links. */
const TRACKING_PARAMS = new Set([
  "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "utm_id",
  "utm_name", "utm_reader", "utm_viz_id", "utm_pubreferrer", "utm_swu", "utm_social", "utm_social-type",
  "fbclid", "gclid", "dclid", "gbraid", "wbraid", "msclkid", "twclid", "ttclid", "li_fat_id",
  "igshid", "mc_cid", "mc_eid", "_hsenc", "_hsmi", "mkt_tok", "vero_id", "vero_conv",
  "oly_anon_id", "oly_enc_id", "yclid", "_ga", "_gl", "_gac", "spm", "scm",
  "ref_src", "ref_url", "s_kwcid", "wickedid", "rb_clickid", "irclickid", "zanpid",
  "hsa_acc", "hsa_cam", "hsa_grp", "hsa_ad", "hsa_src", "hsa_tgt", "hsa_kw", "hsa_mt", "hsa_net", "hsa_ver",
]);

/** Cosmetic DOM selectors for ad slots, sponsored widgets, and cookie/consent walls. */
export const COSMETIC_SELECTORS = [
  "ins.adsbygoogle",
  "[id^='google_ads_']",
  "[id^='div-gpt-ad']",
  "[data-ad-slot]",
  "[data-ad-unit]",
  "[data-ad-client]",
  "[data-google-query-id]",
  "[class*='ad-slot']",
  "[class*='ad-banner']",
  "[class*='ad-container']",
  "[id*='taboola']",
  "[class*='taboola']",
  "[id*='outbrain']",
  "[class*='outbrain']",
  "#onetrust-consent-sdk",
  "#onetrust-banner-sdk",
  "#CybotCookiebotDialog",
  ".cc-window",
  "[id*='cookie-banner']",
  "[class*='cookie-banner']",
  "[id*='cookie-consent']",
  "[class*='cookie-consent']",
  "[aria-label='advertisement' i]",
  "[aria-label='sponsored' i]",
];

/** Inline script signatures that indicate embedded analytics, pixels, or ad tags. */
export const INLINE_TRACKERS: [RegExp, string, Category][] = [
  [/\bgtag\s*\(\s*['"](config|event|js)['"]/i, "inline:gtag", "trackers"],
  [/\bga\s*\(\s*['"](create|send)['"]/i, "inline:google-analytics", "trackers"],
  [/GoogleAnalyticsObject/i, "inline:ga-object", "trackers"],
  [/dataLayer\.push\s*\(/i, "inline:gtm-dataLayer", "trackers"],
  [/\bfbq\s*\(\s*['"](init|track)['"]/i, "inline:meta-pixel", "social"],
  [/\b_paq\.push\s*\(/i, "inline:matomo", "trackers"],
  [/adsbygoogle\s*=\s*window\.adsbygoogle/i, "inline:adsense", "ads"],
  [/googletag\.cmd\.push/i, "inline:gpt-ads", "ads"],
  [/\bhj\s*\(\s*['"](identify|event|stateChange)['"]|_hjSettings/i, "inline:hotjar", "trackers"],
  [/mixpanel\.init\s*\(/i, "inline:mixpanel", "trackers"],
  [/amplitude\.getInstance\s*\(/i, "inline:amplitude", "trackers"],
  [/clarity\s*\(\s*['"]set['"]|window\.clarity/i, "inline:ms-clarity", "trackers"],
  [/ttq\.load\s*\(/i, "inline:tiktok-pixel", "social"],
  [/pintrk\s*\(\s*['"]load['"]/i, "inline:pinterest-tag", "social"],
  [/lintrk\s*\(/i, "inline:linkedin-insight", "social"],
  [/window\.uetq\s*=/i, "inline:bing-uet", "trackers"],
  [/__cfBeacon/i, "inline:cf-beacon", "trackers"],
];

const domainMap = new Map<string, Category>();
for (const [d, c] of DOMAINS) domainMap.set(d, c);

export interface BlockResult {
  cat: Category;
  rule: string;
  url: string;
  kind?: BlockKind;
}

function catEnabled(cat: Category, opts?: FilterOptions): boolean {
  if (opts?.shields === false) return false;
  if (cat === "social" && opts?.blockSocial === false) return false;
  if (cat === "miners" && opts?.blockMiners === false) return false;
  return true;
}

export function blockCheck(
  rawUrl: string,
  opts?: FilterOptions,
  kind: BlockKind = "network",
): BlockResult | null {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const allow = opts?.allow || [];
  const deny = opts?.deny || [];

  for (const a of allow) {
    const clean = a.toLowerCase().replace(/^www\./, "");
    if (clean && (host === clean || host.endsWith("." + clean))) return null;
  }
  for (const d of deny) {
    const clean = d.toLowerCase().replace(/^www\./, "");
    if (clean && (host === clean || host.endsWith("." + clean))) {
      return { cat: "ads", rule: `custom:${clean}`, url: rawUrl, kind };
    }
  }

  if (opts?.shields === false) return null;

  const parts = host.split(".");
  for (let i = 0; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    const cat = domainMap.get(candidate);
    if (cat) {
      // Social rules only guard embedded widgets. Visiting instagram.com or linkedin.com yourself is never blocked.
      return catEnabled(cat, opts) && !(kind === "navigation" && cat === "social")
        ? { cat, rule: candidate, url: rawUrl, kind }
        : null;
    }
  }
  for (const [re, cat] of PATHS) {
    // PATHS regexes guard subresources. On the address you deliberately
    // navigated to they false-positive (?ad=, /ads/ on real pages) — ads
    // paths never block a navigation; domain-map ad hosts still do.
    if (kind === "navigation" && cat === "ads") continue;
    if (re.test(rawUrl) && catEnabled(cat, opts)) return { cat, rule: re.source, url: rawUrl, kind };
  }
  return null;
}

/** Strip known tracking query parameters (`utm_*`, `fbclid`, `gclid`, etc.) from a URL. */
export function stripTrackingParams(
  rawUrl: string,
  opts?: FilterOptions,
): { url: string; stripped: BlockResult[] } {
  if (opts?.shields === false || opts?.stripParams === false) return { url: rawUrl, stripped: [] };
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    return { url: rawUrl, stripped: [] };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { url: rawUrl, stripped: [] };

  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  for (const a of opts?.allow || []) {
    const clean = a.toLowerCase().replace(/^www\./, "");
    if (clean && (host === clean || host.endsWith("." + clean))) return { url: rawUrl, stripped: [] };
  }

  const stripped: BlockResult[] = [];
  const doomed: string[] = [];
  u.searchParams.forEach((_val, key) => {
    const k = key.toLowerCase();
    if (TRACKING_PARAMS.has(k) || k.startsWith("utm_")) {
      doomed.push(key);
      stripped.push({ cat: "trackers", rule: `param:${k}`, url: rawUrl, kind: "param" });
    }
  });
  if (!doomed.length) return { url: rawUrl, stripped: [] };
  for (const k of doomed) u.searchParams.delete(k);
  return { url: u.toString(), stripped };
}

/** Bing click URLs hide the destination in `u=a1` + base64. */
function decodeBingClick(param: string | null): string | null {
  if (!param) return null;
  let b64 = param.replace(/^a1/, "").replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  try {
    const decoded = atob(b64);
    return /^https?:\/\//i.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Un-wrap redirectors search engines and social sites wrap real destinations in, then scrub tracking params. */
export function unwrapRedirect(rawUrl: string, opts?: FilterOptions): string {
  let cur = rawUrl;
  for (let depth = 0; depth < 3; depth++) {
    let u: URL;
    try {
      u = new URL(cur);
    } catch {
      break;
    }
    const host = u.hostname.toLowerCase();
    // Exact-or-dot-suffix: bare endsWith let lookalike domains
    // (notbing.com, myyoutube.com) hijack the redirect unwrapping.
    const isHost = (h: string, base: string) => h === base || h.endsWith("." + base);
    let next: string | null = null;
    if (isHost(host, "duckduckgo.com") && u.searchParams.get("uddg")) {
      next = u.searchParams.get("uddg");
    } else if (isHost(host, "bing.com") && u.pathname.startsWith("/ck/")) {
      next = decodeBingClick(u.searchParams.get("u")) || u.searchParams.get("url") || u.searchParams.get("q");
    } else if (/(^|\.)google\.[a-z.]+$/i.test(host) && (u.pathname === "/url" || u.pathname === "/imgres")) {
      next = u.searchParams.get("q") || u.searchParams.get("url") || u.searchParams.get("imgurl");
    } else if (isHost(host, "startpage.com") && (u.searchParams.get("url") || u.searchParams.get("u"))) {
      next = u.searchParams.get("url") || u.searchParams.get("u");
    } else if ((isHost(host, "ecosia.org") || isHost(host, "mojeek.com")) && u.searchParams.get("url")) {
      next = u.searchParams.get("url");
    } else if ((host === "l.facebook.com" || host === "lm.facebook.com" || host === "l.instagram.com") && u.searchParams.get("u")) {
      next = u.searchParams.get("u");
    } else if (isHost(host, "youtube.com") && u.pathname === "/redirect") {
      next = u.searchParams.get("q");
    } else if (host === "out.reddit.com" && u.searchParams.get("url")) {
      next = u.searchParams.get("url");
    } else if (host === "t.umblr.com" && u.searchParams.get("z")) {
      next = u.searchParams.get("z");
    }
    if (next && /^https?:\/\//i.test(next) && next !== cur) {
      cur = next;
    } else {
      break;
    }
  }
  return stripTrackingParams(cur, opts).url;
}

export const RULE_COUNT =
  DOMAINS.length + PATHS.length + TRACKING_PARAMS.size + COSMETIC_SELECTORS.length + INLINE_TRACKERS.length;

/** Curated third-party hosts to look for even when a page hides them behind inline code. */
export const KNOWN_HOSTS = DOMAINS.map((d) => d[0]);
