import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: { bodyParser: false },
};

const TRADESVIZ_API_KEY = process.env.TRADESVIZ_API_KEY;

export default async function handler(req, res) {
  console.log("🔥 API HIT:", req.method);

  if (req.method !== "POST") {
    console.log("❌ Method not allowed:", req.method);
    return res.status(405).json({ error: "Method not allowed" });
  }

  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.log("❌ Form parse error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }

    console.log("📂 Files parsed:", Object.keys(files));

    const file = files.file;
    if (!file) {
      console.log("❌ No file in upload");
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      console.log("⬆️ Uploading to TradesViz...");

      const uploadRes = await fetch(
        "https://api.tradesviz.com/v1/import/trades/csv/",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${TRADESVIZ_API_KEY}`,
          },
          body: fs.createReadStream(file.filepath),
        }
      );

      console.log("📥 TradesViz upload status:", uploadRes.status);

      const uploadJson = await uploadRes.json();
      console.log("📃 TradesViz upload JSON:", uploadJson);

      if (!uploadJson.success) {
        console.log("❌ Upload to TradesViz failed");
        return res.status(500).json({ error: uploadJson });
      }

      const importId = uploadJson.import_id;

      console.log("⏳ Polling import:", importId);

      let processed = false;

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 1500));

        const statusRes = await fetch(
          `https://api.tradesviz.com/v1/import/trades/status/${importId}/`,
          {
            headers: { Authorization: `Token ${TRADESVIZ_API_KEY}` },
          }
        );

        const statusJson = await statusRes.json();
        console.log(`🔎 Poll #${i + 1}:`, statusJson);

        if (statusJson.status === "completed") {
          processed = true;
          break;
        }
      }

      if (!processed) {
        console.log("❌ TradesViz processing timeout");
        return res.status(500).json({ error: "TradesViz processing timeout" });
      }

      console.log("⬇️ Downloading detailed CSV...");

      const fullRes = await fetch(
        "https://api.tradesviz.com/v1/export/trades/csv/",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${TRADESVIZ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            include_mae_mfe: true,
            include_risk: true,
            include_exits: true,
            include_positions: true,
          }),
        }
      );

      console.log("📥 Detailed CSV status:", fullRes.status);

      const csvText = await fullRes.text();
      console.log("📄 Received CSV length:", csvText.length);

      return res.status(200).json({
        ok: true,
        csvLength: csvText.length,
        preview: csvText.slice(0, 500),
      });
    } catch (e) {
      console.log("🔥 SERVER CRASH:", e);
      return res.status(500).json({
        error: "Server error",
        details: e.message,
      });
    }
  });
}
