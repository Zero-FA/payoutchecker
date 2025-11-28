export default function handler(req, res) {
  // In-memory event log (populated by /api/track)
  global._events = global._events || [];
  const events = global._events;

  // ----- BASIC COUNTS -----
  const pageViews = events.filter(e => e.event === "page_view").length;
  const sessionEnds = events.filter(e => e.event === "session_end").length;
  const affiliateClicks = events.filter(e => e.event === "affiliate_click").length;
  const accountSelects = events.filter(e => e.event === "account_select").length;

  const uniqueVisitors = new Set(events.map(e => e.sessionId)).size;

  // ----- RECENT SESSIONS -----
  const recentSessionsRaw = events
    .filter(e => e.event === "session_end")
    .slice(-20)
    .reverse();

  const recentSessions = recentSessionsRaw.map(e => ({
    sessionId: e.sessionId,
    durationMs: e.data?.durationMs || 0,
    device: e.data?.device || e.data?.deviceType || "Unknown",
    browser: e.data?.browser || "Unknown",
    referrer: e.data?.referrerDomain || "direct",
    ipHash: e.data?.ipHash || "",
  }));

  // ----- RECENT EVENTS -----
  const recentEvents = events.slice(-50).reverse();

  // ----- AVG SESSION DURATION -----
  const avgDurationSec =
    recentSessions.length > 0
      ? Math.round(
          recentSessions.reduce((a, b) => a + (b.durationMs || 0), 0) /
            recentSessions.length /
            1000
        )
      : 0;

  // ----- BREAKDOWNS -----
  const breakdowns = {
    devices: {},
    browsers: {},
    referrers: {},
    accounts: {},
  };

  events.forEach(e => {
    const d = e.data || {};

    if (d.device) breakdowns.devices[d.device] = (breakdowns.devices[d.device] || 0) + 1;
    if (d.browser) breakdowns.browsers[d.browser] = (breakdowns.browsers[d.browser] || 0) + 1;
    if (d.referrerDomain)
      breakdowns.referrers[d.referrerDomain] =
        (breakdowns.referrers[d.referrerDomain] || 0) + 1;
    if (e.event === "account_select" && d.account)
      breakdowns.accounts[d.account] = (breakdowns.accounts[d.account] || 0) + 1;
  });

  // ----- FINAL RESPONSE -----
  res.status(200).json({
    totals: {
      activeSessions: pageViews - sessionEnds,
      totalSessions: pageViews,
      avgDurationSec,
      affiliateClicks,
    },
    breakdowns,
    recentSessions,
    recentEvents,
    now: Date.now(),
  });
}
