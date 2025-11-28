export default function handler(req, res) {
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const ua = req.headers["user-agent"] || "";
  const host = req.headers["host"] || "";

  const REAL_HOST = "apexpayoutchecker.vercel.app";

  const isRealHost = host === REAL_HOST;

  const isBrowser =
    ua.includes("Chrome") ||
    ua.includes("Firefox") ||
    ua.includes("Safari") ||
    ua.includes("Edge") ||
    ua.includes("Mobile") ||
    ua.includes("Mozilla");

  if (!isRealHost) {
    return res.status(200).json({
      ok: true,
      type: "IGNORED_NON_PRIMARY_HOST",
      host,
      ip,
      userAgent: ua
    });
  }

  if (!isBrowser) {
    return res.status(200).json({
      ok: true,
      type: "IGNORED_NON_HUMAN",
      host,
      ip,
      userAgent: ua
    });
  }

  console.log(`[HUMAN] ${ip} | Host: ${host}`);

  return res.status(200).json({
    ok: true,
    type: "HUMAN",
    host,
    ip,
    userAgent: ua
  });
}
