// ponytail: one runnable check for the rollout bug-fix batch — the pure-logic fixes.
import { isUrl } from "./src/lib/nav";
import { blockCheck } from "./src/lib/filters";

let bad = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  if (got !== want) {
    console.log(`FAIL ${name}: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
    bad++;
  }
};

// isUrl: LAN IPs and host?query are URLs now, prose still isn't.
eq("isUrl 192.168.1.1", isUrl("192.168.1.1"), true);
eq("isUrl 10.0.0.1:8080", isUrl("10.0.0.1:8080"), true);
eq("isUrl host?query", isUrl("example.com?id=5"), true);
eq("isUrl host#hash", isUrl("example.com#top"), true);
eq("isUrl prose", isUrl("hello world"), false);
eq("isUrl single word", isUrl("hello"), false);

// blockCheck: ads PATHS never block a navigation, still block subresources.
const opts = { shields: true } as never; // default posture
eq(
  "nav /ads/ path",
  blockCheck("https://example.com/ads/", opts, "navigation"),
  null,
);
eq(
  "nav ?ad= query",
  blockCheck("https://example.com/watch?v=1&ad=1", opts, "navigation"),
  null,
);
eq(
  "nav domain-map ad host still interstitials",
  blockCheck("https://doubleclick.net/", opts, "navigation") !== null,
  true,
);
eq(
  "subresource /ads/ still blocked",
  blockCheck("https://example.com/ads/banner.js", opts, "subresource") !== null,
  true,
);

console.log(bad === 0 ? "all logic checks pass" : `${bad} failures`);
process.exit(bad ? 1 : 0);
