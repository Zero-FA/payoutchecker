import formidable from "formidable";
import fs from "fs";

export const config = {
  api: { bodyParser: false },
};

const API_KEY = process.env.TRADESVIZ_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const form = formidable({ multiples: false });

    // Wrap formidable in a promise
    const { files } = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) reject(err);
        else resolve({ fields, files });
      });
    });

    const file = files.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = file.filepath || file.path; // Formidable v3 uses filepath

    // -------------------------
    // 1. UPLOAD CSV TO TRADESVIZ
    // -------------------------
    const uploadRes = await fetch(
      "https://api.tradesviz.com/v1/import/trades/csv/",
      {
        method: "POST",
        headers: { Authorization: `Token ${API_KEY}` },
        body: fs.createReadStream(filePath),
      }
    );

    const uploadJson = await uploadRes.json();

    if (!uploadJson.success || !uploadJson.import_id) {
      return res.status(500).json({ error: uploadJson });
    }

    const importId = uploadJson.import_id;

    // -------------------------
    // 2. WAIT FOR PROCESSING
    // -------------------------
    let processed = false;
    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 1500));

      const statusRes = await fetch(
        `https://api.tradesviz.com/v1/import/trades/status/${importId}/`,
        { headers: { Authorization: `Token ${API_KEY}` } }
      );

      const statusJson = await statusRes.json();

      if (statusJson.status === "completed") {
        processed = true;
        break;
      }
    }

    if (!processed) {
      return res.status(500).json({ error: "TradesViz processing timeout" });
    }

    // -------------------------
    // 3. DOWNLOAD FULL REPORT
    // -------------------------
    const exportRes = await fetch(
      "https://api.tradesviz.com/v1/export/trades/csv/",
      {
        method: "POST",
        headers: {
          Authorization: `Token ${API_KEY}`,
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

    const csv = await exportRes.text();

    const rows = csv
      .split("\n")
      .slice(1)
      .map((line) => line.split(","))
      .filter((r) => r.length > 5);

    return res.status(200).json({ ok: true, importId, trades: rows });
  } catch (err) {
    console.error("SERVER ERROR:", err);
    return res
      .status(500)
      .json({ error: "Server error", details: err.message });
  }
}
