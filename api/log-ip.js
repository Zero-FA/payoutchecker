export default function handler(req, res) {
  // Extract public IP
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  // User agent string
  const ua = req.headers["user-agent"] || "";

  // Browser detection (humans)
  const isBrowser =
    ua.includes("Chrome") ||
    ua.includes("Firefox") ||
    ua.includes("Safari") ||
    ua.includes("Edge") ||
    ua.includes("Mobile") ||
    ua.includes("Mozilla");

  // If NOT a browser → ignore (don't log)
  if (!isBrowser) {
    return res.status(200).json({
      ok: true,
      type: "IGNORED_NON_HUMAN",
      ip,
      userAgent: ua
    });
  }

  // LOG ONLY REAL HUMAN VISITORS
  console.log(`[HUMAN] IP: ${ip}`);

  // API response
  return res.status(200).json({
    ok: true,
    type: "HUMAN",
    ip,
    userAgent: ua
  });
}
