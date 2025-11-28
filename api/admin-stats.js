export default async function handler(req, res) {
  // Use global store (in-memory analytics)
  global._events = global._events || [];
  const events = global._events;

  const stats = {
    totalEvents: events.length,
    pageViews: events.filter(e => e.event === "page_view").length,
    affiliateClicks: events.filter(e => e.event === "affiliate_click").length,
    accountSelects: events.filter(e => e.event === "account_select").length,
    sessionsEnded: events.filter(e => e.event === "session_end").length,
    uniqueVisitors: new Set(events.map(e => e.sessionId)).size,
  };

  // Build "recent sessions" and "recent events"
  const recentEvents = events.slice(-50).reverse();
  const recentSessions = events
    .filter(e => e.event === "session_end")
    .slice(-20)
    .reverse()
    .map(e => ({
      sessionId: e.sessionId,
      device: e.data.device || "Unknown",
      browser: e.data.browser || "Unknown",
      referrer: e.data.referrerDomain || "direct",
      durationMs: e.data.durationMs || 0,
      ipHash: e.data.ipHash || "",
    }));

  res.status(200).json({
    totals: {
      activeSessions: stats.pageViews - stats.sessionsEnded,
      totalSessions: stats.pageViews,
      avgDurationSec:
        recentSessions.length > 0
          ? Math.round(
              recentSessions.reduce((a, b) => a + (b.durationMs || 0), 0) /
              recentSessions.length /
              1000
            )
          : 0,
      affiliateClicks: stats.affiliateClicks,
    },
    breakdowns: {
      devices: {},
      browsers: {},
      referrers: {},
      accounts: {},
    },
    recentSessions,
    recentEvents,
    now: Date.now(),
  });
}
