export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Only POST allowed" });
  }

  try {
    const event = req.body;

    global._events = global._events || [];
    global._events.push(event);

    console.log("[TRACK]", event.event, event);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Track ERROR:", err);
    return res.status(400).json({ ok: false });
  }
}
