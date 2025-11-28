// pages/api/track.js
import crypto from "crypto";

const REAL_HOST = "apexpayoutchecker.vercel.app";

// In-memory stores (reset when function is cold-started / redeployed)
const sessions = {};  // sessionId -> { ipHash, firstSeen, lastSeen, device, browser, referrer, durationMs }
const counters = {
  totalSessions: 0,
  affiliateClicks: 0,
  accountSelections: {}, // accountSize -> count
  referrers: {},         // domain -> count
  devices: { mobile: 0, desktop: 0, unknown: 0 },
  browsers: {},          // browserName -> count
};
const recentEvents = []; // last ~100 events

function hashIp(ip) {
  try {
    return crypto
      .createHash("sha256")
      .update(ip)
      .digest("hex")
      .substring(0, 8);
  } catch {
    return "unknown";
  }
}

function getDevice(ua = "") {
  if (/Mobile|Android|iPhone|iPad/i.test(ua)) return "mobile";
  if (!ua) return "unknown";
  return "desktop";
}

function getBrowser(ua = "") {
  if (/Firefox/i.test(ua)) return "Firefox";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome/i.test(ua)) return "Chrome";
  if (/Safari/i.test(ua)) return "Safari";
  if (!ua) return "Unknown";
  return "Other";
}

function bump(map, key) {
  if (!key) key = "unknown";
  map[key] = (map[key] || 0) + 1;
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const host = req.headers["host"] || "";
  const ua = req.headers["user-agent"] || "";
  const ip =
    req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
    req.socket?.remoteAddress ||
    "unknown";

  const isRealHost = host === REAL_HOST;
  const isBrowser =
    ua.includes("Chrome") ||
    ua.includes("Firefox") ||
    ua.includes("Safari") ||
    ua.includes("Edge") ||
    ua.includes("Mobile") ||
    ua.includes("Mozilla");

  // Ignore non-primary host or non-browser completely
  if (!isRealHost || !isBrowser) {
    return res.status(204).end();
  }

  let body = req.body;
  if (typeof body === "string") {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }

  const {
    sessionId,
    event,
    data = {},
    ts,
  } = body || {};

  if (!sessionId || !event) {
    return res.status(400).json({ error: "Missing sessionId or event" });
  }

  const now = ts ? Number(ts) || Date.now() : Date.now();
  const ipHash = hashIp(ip);
  const device = getDevice(ua);
  const browser = getBrowser(ua);
  const referrer = data.referrerDomain || "direct";

  // Init session if new
  if (!sessions[sessionId]) {
    sessions[sessionId] = {
      ipHash,
      firstSeen: now,
      lastSeen: now,
      device,
      browser,
      referrer,
      durationMs: 0,
    };

    counters.totalSessions += 1;
    bump(counters.devices, device);
    bump(counters.browsers, browser);
    bump(counters.referrers, referrer);
  } else {
    sessions[sessionId].lastSeen = now;
  }

  // Event-specific tracking
  if (event === "account_select" && data.account) {
    bump(counters.accountSelections, data.account);
  }

  if (event === "affiliate_click") {
    counters.affiliateClicks += 1;
  }

  if (event === "session_end" && typeof data.durationMs === "number") {
    sessions[sessionId].durationMs = data.durationMs;
  }

  // Keep a rolling buffer of events (last 100)
  recentEvents.push({
    ts: now,
    sessionId,
    event,
    data,
  });
  if (recentEvents.length > 100) {
    recentEvents.shift();
  }

  return res.status(204).end();
}

// Export internal state for the admin-stats route (same lambda instance)
export { sessions, counters, recentEvents };
