export default function handler(req, res) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const ua = req.headers["user-agent"] || "";
  const host = req.headers["host"] || "";

  // Your real deployed domain
  const REAL_HOST = "apexpayoutchecker.vercel.app";

  // Only allow logs from your real domain
  const isRealHost = host === REAL_HOST;

  // Basic browser check
  const isBrowser =
    ua.includes("Chrome") ||
    ua.includes("Firefox") ||
    ua.includes("Safari") ||
    ua.includes("Edge") ||
    ua.includes("Mobile") ||
    ua.includes("Mozilla");

  // ❗IGNORED HOSTS → RETURN NOTHING (no message in logs)
  if (!isRealHost) {
    return res.status(204).end(); // <-- No Content, Vercel logs NOTHING
  }

  // ❗IGNORED NON-HUMANS → RETURN NOTHING
  if (!isBrowser) {
    return res.status(204).end();
  }

  // 🎯 LOG ONLY REAL HUMANS FROM YOUR REAL DOMAIN
  console.log(`[HUMAN] ${ip} | Host: ${host}`);

  return res.status(200).json({ ok: true });
}
