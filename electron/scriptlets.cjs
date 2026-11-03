// Quill webview scriptlets — injected at DOCUMENT-START into the page's MAIN
// world via Page.addScriptToEvaluateOnNewDocument (electron/main.cjs).
//
// Runs BEFORE any page script: YouTube's inline player fetch then goes through
// our wrapped fetch/JSON.parse, so the first video gets scrubbed too — not
// just SPA navigations after a late injection.
//
// SECURITY RULE: this file must stay pure JS with zero privileged access —
// no require(), no ipcRenderer, no Node APIs. The page can read everything
// here by design, so nothing here may hold authority. The main process still
// hardens the webview (sandbox, contextIsolation, no nodeIntegration)
// and enforces network rules regardless of what a page does to these flags.

(function () {
  if (typeof window === "undefined") return;

  // ---- popup gate (every site) ----
  // Chromium's own popup-blocker rule: window.open is only honoured while a
  // real user gesture is active. Ad popunders fire on timers/scroll/page-load/
  // synthetic clicks — no activation — so they die in the page.
  if (!window.__quillPopupGate) {
    window.__quillPopupGate = 1;
    var oo = window.open;
    if (oo) {
      try {
        window.open = function (url, name, feat) {
          if (!(navigator.userActivation && navigator.userActivation.isActive)) return null;
          return oo.call(window, url, name, feat);
        };
      } catch (e) {}
    }
  }

  // ---- YouTube ad scrub (youtube.com only) ----
  var host = "";
  try {
    host = location.hostname.toLowerCase();
  } catch (e) {}
  if (!/(^|\.)youtube\.com$/.test(host)) return;
  if (window.__quillNoAds) return;
  window.__quillNoAds = 1;

  // Display ads (promoted feed rows, search ads, the home masthead banner)
  // are NATIVE youtube.com feed entries — host-blocking can't touch them and
  // the player scrub doesn't recurse into feed data. Hide the slot elements
  // themselves, uBlock-style: injected at document-start so nothing flashes.
  try {
    var st = document.createElement("style");
    st.textContent =
      "#masthead-ad,ytd-ad-slot-renderer,ytd-promoted-video-renderer," +
      "ytd-in-feed-ad-layout-renderer,ytd-display-ad-renderer," +
      "ytd-banner-promo-renderer,ytd-promoted-sparkles-web-renderer," +
      "ytd-promoted-sparkles-text-search-renderer{display:none!important}";
    var mountStyle = function () { (document.head || document.documentElement).appendChild(st); };
    // document-start can fire before <html> exists — catch up on
    // DOMContentLoaded. Feed ads render from late browse responses, so this
    // still beats them to the screen.
    if (document.documentElement) mountStyle();
    else document.addEventListener("DOMContentLoaded", mountStyle);
  } catch (e) {}

  var strip = function (x) {
    if (!x || typeof x !== "object") return;
    delete x.adPlacements;
    delete x.playerAds;
    delete x.adScreenLayouts;
    if (Array.isArray(x.adSlots)) x.adSlots = [];
  };
  var scrub = function (o) {
    try {
      strip(o);
      strip(o.playerResponse);
      strip(o.response);
      strip(o.playerConfig && o.playerConfig.webPlayerConfig);
    } catch (e) {}
    return o;
  };
  var parse = JSON.parse.bind(JSON);
  JSON.parse = function (t, r) { return scrub(parse(t, r)); };
  var of = window.fetch;
  if (of) {
    window.fetch = function (input, init) {
      var url = typeof input === "string" ? input : (input && input.url) || "";
      var p = of.apply(this, arguments);
      // player/next only — browse responses are megabytes of feed data with
      // no player ads in them, and rewriting them slows the whole site down.
      if (!/youtubei\/v1\/(player|next)/.test(url)) return p;
      return p.then(function (res) {
        try {
          if (res.bodyUsed) return res;
          var ct = (res.headers && res.headers.get("content-type")) || "";
          if (ct.indexOf("json") < 0) return res;
          return res.clone().text().then(function (txt) {
            // Cheap scan first: most responses carry no ads at all — rebuilding
            // those (parse + re-serialize) is pure overhead on every page load.
            if (txt.indexOf("adPlacements") < 0 && txt.indexOf("adSlots") < 0 && txt.indexOf("playerAds") < 0 && txt.indexOf("adScreenLayouts") < 0) return res;
            try {
              // Fresh response without the wire headers: content-encoding and
              // content-length describe the OLD body, not this rebuilt one.
              return new Response(JSON.stringify(scrub(JSON.parse(txt))), { status: res.status, statusText: res.statusText });
            } catch (e) {
              return res;
            }
          });
        } catch (e) {
          return res;
        }
      });
    };
  }
})();
