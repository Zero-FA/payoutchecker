export default function handler(req, res) {
  // Extract IP
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  // Get user agent
  const ua = req.headers["user-agent"] || "";

  // Detection logic
  const isBrowser =
    ua.includes("Chrome") ||
    ua.includes("Firefox") ||
    ua.includes("Safari") ||
    ua.includes("Edge") ||
    ua.includes("Mobile") ||
    ua.includes("Mozilla");

  const isVercel =
    ua.includes("Vercel") ||
    ua.includes("node-fetch") ||
    ua.includes("Next.js") ||
    ua.includes("curl");

  const isHealthCheck =
    ua.includes("Health") ||
    ua.includes("ELB") ||
    ua.includes("Monitor") ||
    ua.includes("Uptime");

  let type = "UNKNOWN";

  if (isBrowser) type = "HUMAN";
  else if (isVercel) type = "VERCEL_EDGE";
  else if (isHealthCheck) type = "HEALTH_CHECK";
  else type = "OTHER";

  // Clean console output
  console.log(`[${type}] IP: ${ip}`);

  // API response
  res.status(200).json({
    ok: true,
    type,
    ip,
    userAgent: ua
  });
}
