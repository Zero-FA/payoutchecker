// pages/api/admin-stats.js
import { sessions, counters, recentEvents } from "./track";

const REAL_HOST = "apexpayoutchecker.vercel.app";

export default function handler(req, res) {
  const host = req.headers["host"] || "";
  if (host !== REAL_HOST) {
    return res.status(403).json({ error: "Forbidden" });
  }

  const now = Date.now();

  const sessionList = Object.values(sessions || {});
  const activeCutoff = now - 25_000; // 25 seconds
  const activeSessions = sessionList.filter(
    (s) => s.lastSeen && s.lastSeen >= activeCutoff
  );

  let totalDuration = 0;
  let durationCount = 0;
  sessionList.forEach((s) => {
    if (s.durationMs && s.durationMs > 0) {
      totalDuration += s.durationMs;
      durationCount += 1;
    }
  });

  const avgDurationSec =
    durationCount > 0 ? Math.round(totalDuration / durationCount / 1000) : 0;

  // Sort sessions by lastSeen (desc) and pick latest 20
  const recentSessions = sessionList
    .slice()
    .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
    .slice(0, 20);

  // Prepare events list (latest 30)
  const recentEventsOut = recentEvents
    .slice(-30)
    .slice()
    .reverse(); // newest first

  return res.status(200).json({
    now,
    totals: {
      totalSessions: counters.totalSessions || 0,
      activeSessions: activeSessions.length,
      avgDurationSec,
      affiliateClicks: counters.affiliateClicks || 0,
    },
    breakdowns: {
      devices: counters.devices || {},
      browsers: counters.browsers || {},
      accounts: counters.accountSelections || {},
      referrers: counters.referrers || {},
    },
    recentSessions,
    recentEvents: recentEventsOut,
  });
}
