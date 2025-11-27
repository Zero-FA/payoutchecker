// In-memory tracker (resets on each deployment)
const sessions = {};

export default function handler(req, res) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const ua = req.headers["user-agent"] || "";
  const host = req.headers["host"] || "";
  const session = req.query.session;

  // Only track real humans on your real domain
  const REAL_HOST = "apexpayoutchecker.vercel.app";

  const isBrowser =
    ua.includes("Chrome") ||
    ua.includes("Firefox") ||
    ua.includes("Safari") ||
    ua.includes("Edge") ||
    ua.includes("Mobile") ||
    ua.includes("Mozilla");

  if (host !== REAL_HOST || !isBrowser || !session) {
    return res.status(200).json({ ok: true, type: "IGNORED" });
  }

  const now = Date.now();

  // If this is the first time seeing this session, create entry
  if (!sessions[session]) {
    sessions[session] = {
      ip,
      start: now,
      last: now
    };
  } else {
    sessions[session].last = now;
  }

  // Check for ended sessions (inactive for 20 seconds)
  for (const [id, data] of Object.entries(sessions)) {
    if (now - data.last > 20000) {
      const durationMs = data.last - data.start;
      const secs = Math.floor(durationMs / 1000);
      const mins = Math.floor(secs / 60);
      const rem = secs % 60;

      console.log(
        `[HUMAN] ${data.ip} stayed for ${mins}m ${rem}s`
      );

      delete sessions[id];
    }
  }

  return res.status(200).json({ ok: true });
}
