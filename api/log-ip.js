export default function handler(req, res) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const ua = req.headers["user-agent"] || "";
  const host = req.headers["host"] || "";

  // NEW: referrer and origin
  const referer = req.headers["referer"] || req.headers["referrer"] || "";
  const origin = req.headers["origin"] || "";

  // Real domain only
  const REAL_HOST = "apexpayoutchecker.vercel.app";
  const isRealHost = host === REAL_HOST;

  // Basic human check
  const isBrowser =
    ua.includes("Chrome") ||
    ua.includes("Firefox") ||
    ua.includes("Safari") ||
    ua.includes("Edge") ||
    ua.includes("Mobile") ||
    ua.includes("Mozilla");

  // Ignore non-primary hosts
  if (!isRealHost) {
    return res.status(200).json({
      ok: true,
      type: "IGNORED_NON_PRIMARY_HOST",
      host,
      ip,
      referer,
      origin,
      userAgent: ua
    });
  }

  // Ignore bots
  if (!isBrowser) {
    return res.status(200).json({
      ok: true,
      type: "IGNORED_NON_HUMAN",
      host,
      ip,
      referer,
      origin,
      userAgent: ua
    });
  }

  // LOG REAL HUMANS
  console.log(
    `[HUMAN] ${ip} | Host: ${host} | From: ${referer || origin || "Direct"}`
  );

  return res.status(200).json({
    ok: true,
    type: "HUMAN",
    host,
    ip,
    referer,
    origin,
    userAgent: ua
  });
}
