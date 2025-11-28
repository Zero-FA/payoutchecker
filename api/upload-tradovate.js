import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false, // Required for formidable to handle file uploads
  },
};

const TRADESVIZ_API_KEY = process.env.TRADESVIZ_API_KEY; // put this in Vercel env vars

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse incoming file upload
  const form = new formidable.IncomingForm();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Form parse error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }

    const file = files.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // -------------------------
      // 1. UPLOAD CSV TO TRADESVIZ
      // -------------------------
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

      const uploadJson = await uploadRes.json();

      if (!uploadJson.success) {
        return res.status(500).json({ error: uploadJson });
      }

      const importId = uploadJson.import_id;

      // -------------------------
      // 2. WAIT FOR TRADESVIZ TO PROCESS
      // -------------------------
      let processed = false;
      let resultData = null;

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 1500));

        const statusRes = await fetch(
          `https://api.tradesviz.com/v1/import/trades/status/${importId}/`,
          {
            headers: { Authorization: `Token ${TRADESVIZ_API_KEY}` },
          }
        );

        const statusJson = await statusRes.json();

        if (statusJson.status === "completed") {
          processed = true;
          resultData = statusJson;
          break;
        }
      }

      if (!processed) {
        return res.status(500).json({
          error: "TradesViz processing timeout",
        });
      }

      // -------------------------
      // 3. DOWNLOAD DETAILED TRADES REPORT
      // -------------------------
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

      const csvText = await fullRes.text();

      // Convert CSV → JSON rows
      const trades = csvText
        .split("\n")
        .slice(1)
        .map((line) => line.split(","))
        .filter((row) => row.length > 5);

      return res.status(200).json({
        ok: true,
        importId,
        trades,
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Server error", details: e.message });
    }
  });
}
