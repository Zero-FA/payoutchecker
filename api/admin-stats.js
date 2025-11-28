export default async function handler(req, res) {
  // -------- PASSWORD CHECK --------
  const password = req.query.key;
  const ADMIN_KEY = "seanadmin";

  if (password !== ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  // -------- READ DATA FROM TRACK LOGS --------
  // IMPORTANT: Vercel Serverless cannot store files,
  // so we use Edge Config + fallback memory in dev.

  global._events = global._events || [];
  const events = global._events;

  // Collect stats
  const stats = {
    totalEvents: events.length,
    pageViews: events.filter(e => e.event === "page_view").length,
    affiliateClicks: events.filter(e => e.event === "affiliate_click").length,
    accountSelects: events.filter(e => e.event === "account_select").length,
    sessionsEnded: events.filter(e => e.event === "session_end").length,

    // Unique visitors by sessionId
    uniqueVisitors: new Set(events.map(e => e.sessionId)).size,

    // Group account selections
    accountUsage: (() => {
      const buckets = {};
      events
        .filter(e => e.event === "account_select")
        .forEach(e => {
          const acc = e.data?.account || "unknown";
          buckets[acc] = (buckets[acc] || 0) + 1;
        });
      return buckets;
    })(),

    // Average session duration
    avgSessionDuration: (() => {
      const sess = events.filter(e => e.event === "session_end");
      if (!sess.length) return 0;
      const total = sess.reduce((sum, e) => sum + (e.data?.durationMs || 0), 0);
      return Math.round(total / sess.length);
    })(),

    // Top referrers
    referrers: (() => {
      const bucket = {};
      events.forEach(e => {
        const r = e.data?.referrerDomain || "direct";
        bucket[r] = (bucket[r] || 0) + 1;
      });
      return bucket;
    })(),
  };

  return res.status(200).json({
    ok: true,
    stats,
    events: events.slice(-200) // return last 200 events
  });
}
