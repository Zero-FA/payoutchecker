import formidable from "formidable";
import fs from "fs";
import FormData from "form-data";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false, // must be disabled for file uploads
  },
};

const TRADESVIZ_API_KEY = process.env.TRADESVIZ_API_KEY;

export default async function handler(req, res) {
  console.log("🔥 API HIT:", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
    }

  const form = formidable({
    multiples: false,
    keepExtensions: true,
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Form parse error:", err);
      return res.status(500).json({ error: "Failed to parse form" });
    }

    const file = files.file?.[0] || files.file;
    if (!file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    console.log("📂 Parsed files:", files);

    try {
      // -------------------------
      // 1. TradesViz Broker IMPORT (Tradovate)
      // -------------------------
      console.log("⬆️ Uploading file to TradesViz…");

      const formData = new FormData();

      formData.append(
        "file",
        fs.createReadStream(file.filepath),
        file.originalFilename
      );

      formData.append("broker", "tradovate");

      // Minimal configs required by TradesViz
      formData.append(
        "configs",
        JSON.stringify({
          import_type: "orders",
          trades_config: { delimiter: ",", header: 1 }
        })
      );

      const uploadRes = await fetch(
        "https://api.tradesviz.com/v1/import/trades/broker/csv/",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${TRADESVIZ_API_KEY}`,
            ...formData.getHeaders(),
          },
          body: formData,
          redirect: "manual"
        }
      );

      console.log("📥 Upload status:", uploadRes.status);

      const uploadJson = await uploadRes.json().catch(async () => {
        const text = await uploadRes.text();
        throw new Error("TradesViz returned non-JSON: " + text);
      });

      console.log("🔎 TradesViz Response:", uploadJson);

      if (!uploadJson.success) {
        return res.status(500).json({ error: uploadJson });
      }

      const importId = uploadJson.import_id;

      // -------------------------
      // 2. Poll for processing completion
      // -------------------------
      console.log("⏳ Waiting for processing…");

      let done = false;
      let importStatus = null;

      for (let i = 0; i < 15; i++) {
        await new Promise(r => setTimeout(r, 1500));

        const statusRes = await fetch(
          `https://api.tradesviz.com/v1/import/trades/status/${importId}/`,
          {
            headers: { Authorization: `Token ${TRADESVIZ_API_KEY}` },
          }
        );

        const statusJson = await statusRes.json();

        if (statusJson.status === "completed") {
          done = true;
          importStatus = statusJson;
          break;
        }
      }

      if (!done) {
        return res.status(500).json({
          error: "TradesViz processing timeout",
        });
      }

      // -------------------------
      // 3. Export full trades (with MAE/MFE)
      // -------------------------
      console.log("⬇️ Downloading processed trades…");

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
            include_risk: true,
            include_positions: true,
            include_exits: true,
          }),
        }
      );

      const csvText = await exportRes.text();

      // Convert CSV → array of rows
      const trades = csvText
        .split("\n")
        .slice(1)
        .map(line => line.split(","))
        .filter(row => row.length > 3);

      return res.status(200).json({
        ok: true,
        importId,
        trades,
      });

    } catch (e) {
      console.error("🔥 SERVER ERROR:", e);
      return res.status(500).json({
        error: "Server error",
        details: e.message,
      });
    }
  });
}
