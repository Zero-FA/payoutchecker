export default function handler(req, res) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ error: "Method not allowed" });
    }

    const event = req.body;

    // Initialize global store
    global._events = global._events || [];

    // Push event into memory log
    global._events.push({
      sessionId: event.sessionId || "unknown",
      event: event.event || "unknown",
      data: event.data || {},
      ts: event.ts || Date.now(),
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Server error", details: err.message });
  }
}
