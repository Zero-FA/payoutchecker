// /api/upload-tradovate.js
import fs from "fs";
import formidable from "formidable";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false,
  },
};

const TRADESVIZ_API_KEY = process.env.TRADESVIZ_API_KEY;

export default async function handler(req, res) {
  console.log("🔥 API HIT:", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse CSV upload with formidable
  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Form parse error:", err);
      return res.status(500).json({ error: "Failed to parse form" });
    }

    const file = files.file;
    if (!file) {
      return res.status(400).json({ error: "CSV file missing" });
    }

    console.log("📂 Parsed file:", {
      original: file.originalFilename,
      path: file.filepath,
      size: file.size,
    });

    try {
      // ----------------------------------
      // 1) UPLOAD TO TRADESVIZ (BROKER API)
      // ----------------------------------
      console.log("⬆️ Uploading file to TradesViz…");

      const fd = new FormData();
      fd.append("file", fs.createReadStream(file.filepath), file.originalFilename);
      fd.append("broker", "tradovate");
      fd.append("import_type", "trades");

      const uploadRes = await fetch(
        "https://api.tradesviz.com/v1/import/trades/broker/",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${TRADESVIZ_API_KEY}`,
            ...fd.getHeaders(),
          },
          body: fd,
          redirect: "manual", // prevents HTML redirect loops
        }
      );

      const uploadText = await uploadRes.text();

      let uploadJson;
      try {
        uploadJson = JSON.parse(uploadText);
      } catch (e) {
        console.error("❌ TradesViz returned non-JSON:", uploadText);
        return res.status(500).json({ error: "TradesViz non-JSON response", raw: uploadText });
      }

      console.log("📥 Upload JSON:", uploadJson);

      if (!uploadJson.success || !uploadJson.import_id) {
        return res.status(500).json({
          error: "TradesViz upload failed",
          details: uploadJson,
        });
      }

      const importId = uploadJson.import_id;

      // ----------------------------------
      // 2) POLL FOR PROCESSING COMPLETION
      // ----------------------------------
      console.log("⏳ Waiting for TradesViz to process import…");

      let processed = false;
      let statusJson = null;

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 1500));

        const statusRes = await fetch(
          `https://api.tradesviz.com/v1/import/trades/status/${importId}/`,
          {
            headers: { Authorization: `Token ${TRADESVIZ_API_KEY}` },
          }
        );

        statusJson = await statusRes.json();
        console.log(`📊 Status check #${i + 1}:`, statusJson.status);

        if (statusJson.status === "completed") {
          processed = true;
          break;
        }
      }

      if (!processed) {
        return res.status(500).json({
          error: "TradesViz import timed out",
          importId,
        });
      }

      // ----------------------------------
      // 3) DOWNLOAD DETAILED CSV EXPORT
      // ----------------------------------
      console.log("📥 Downloading full trade report CSV…");

      const exportRes = await fetch(
        "https://api.tradesviz.com/v1/export/trades/csv/",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${TRADESVIZ_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            include_mae_mfe: true,
            include_positions: true,
            include_risk: true,
            include_exits: true,
          }),
        }
      );

      const exportCSV = await exportRes.text();

      // CSV → JSON Parsing
      const lines = exportCSV.split("\n");
      const header = lines[0].split(",");

      const rows = lines
        .slice(1)
        .filter((l) => l.trim().length > 0)
        .map((line) => {
          const cols = line.split(",");
          const obj = {};
          cols.forEach((val, idx) => (obj[header[idx]] = val));
          return obj;
        });

      console.log("✅ Parsed trades:", rows.length);

      return res.status(200).json({
        ok: true,
        importId,
        trades: rows,
      });
    } catch (error) {
      console.error("🔥 SERVER ERROR:", error);
      return res.status(500).json({
        error: "Server error",
        message: error.message,
      });
    }
  });
}
