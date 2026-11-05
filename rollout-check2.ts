// runnable check for the update-compare logic
import { isNewer } from "./src/lib/updates";
let bad = 0;
const eq = (n, g, w) => { if (g !== w) { console.log("FAIL", n, g, w); bad++; } };
eq("newer patch", isNewer("1.0.1", "1.0.0"), true);
eq("older", isNewer("1.0.0", "1.0.1"), false);
eq("equal", isNewer("1.2.3", "1.2.3"), false);
eq("major", isNewer("2.0.0", "1.9.9"), true);
eq("v prefix", isNewer("v1.0.1", "1.0.0"), true);
eq("fewer parts", isNewer("1.1", "1.0.5"), true);
eq("pre-release tag", isNewer("1.0.0-rc1", "1.0.0"), false);
console.log(bad === 0 ? "all update checks pass" : `${bad} failures`);
process.exit(bad ? 1 : 0);
