// Check the GitHub release feed against the installed version — the lazy,
// zero-infra update check for v1. When a real update server exists, swap
// this module only.
// ponytail: GitHub API rate limit (60/hr per IP) bounds manual checks; fine
// for a button. Auto-polling would need caching + backoff.
const REPO = "https://api.github.com/repos/nimvorodev/quill-browser/releases/latest";

export async function checkForUpdates(timeoutMs = 8000): Promise<{ latest?: string; url?: string } | null> {
  const c = new AbortController();
  const t = window.setTimeout(() => c.abort(), timeoutMs);
  try {
    const r = await fetch(REPO, { signal: c.signal, headers: { Accept: "application/vnd.github+json" } });
    if (!r.ok) return null;
    const j = await r.json();
    const tag = String(j?.tag_name || "").replace(/^v/i, "");
    if (!tag) return null;
    return { latest: tag, url: String(j?.html_url || "") || undefined };
  } catch {
    return null; // offline or rate-limited — stay silent, not alarming
  } finally {
    window.clearTimeout(t);
  }
}

/** True when `latest` is a higher semver than `current` (drops leading "v"). */
export function isNewer(latest: string, current: string): boolean {
  const a = latest.replace(/^v/i, "").split(".").map(Number);
  const b = current.replace(/^v/i, "").split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x > y;
  }
  return false;
}
