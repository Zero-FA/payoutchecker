import { formidable } from "formidable";
import fs from "fs";
import fetch from "node-fetch";
import FormData from "form-data";

export const config = {
  api: { bodyParser: false },
};

const TRADESVIZ_API_KEY = process.env.TRADESVIZ_API_KEY;

export default async function handler(req, res) {
  console.log("🔥 API HIT:", req.method);

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse CSV upload from frontend
  const form = formidable({
    multiples: false,
    keepExtensions: true
  });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.log("❌ Form parse error:", err);
      return res.status(500).json({ error: "Upload failed" });
    }

    console.log("📂 Parsed files:", files);

    const file = files.file?.[0];
    if (!file) {
      console.log("❌ No file uploaded");
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
      // ------------------------------------------
      // 1️⃣ STEP 1 — Upload raw CSV → get file_id
      // ------------------------------------------
      console.log("⬆️ Uploading file to TradesViz…");

      const uploadForm = new FormData();
      uploadForm.append("file", fs.createReadStream(file.filepath));

      const uploadRes = await fetch("https://api.tradesviz.com/v1/import/upload/", {
        method: "POST",
        headers: {
          Authorization: `Token ${TRADESVIZ_API_KEY}`,
          ...uploadForm.getHeaders()
        },
        body: uploadForm,
        redirect: "manual"
      });

      console.log("📥 Upload status:", uploadRes.status);
      const uploadJson = await uploadRes.json();
      console.log("📄 Upload JSON:", uploadJson);

      if (!uploadJson.success) {
        return res.status(500).json({ error: uploadJson });
      }

      const fileId = uploadJson.file_id;
      console.log("📁 file_id:", fileId);

      // ------------------------------------------
      // 2️⃣ STEP 2 — Start import → get import_id
      // ------------------------------------------
      console.log("🚀 Starting TradesViz import…");

      const importRes = await fetch("https://api.tradesviz.com/v1/import/trades/", {
        method: "POST",
        headers: {
          Authorization: `Token ${TRADESVIZ_API_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          file_id: fileId,
          import_name: "Tradovate Upload"
        })
      });

      const importJson = await importRes.json();
      console.log("📄 Import JSON:", importJson);

      if (!importJson.success) {
        return res.status(500).json({ error: importJson });
      }

      const importId = importJson.import_id;
      console.log("🆔 import_id:", importId);

      // ------------------------------------------
      // 3️⃣ STEP 3 — Poll until import completes
      // ------------------------------------------
      console.log("⏳ Polling for processing…");

      let finished = false;

      for (let i = 0; i < 20; i++) {
        await new Promise((r) => setTimeout(r, 1500));

        const statusRes = await fetch(
          `https://api.tradesviz.com/v1/import/status/${importId}/`,
          {
            method: "GET",
            headers: {
              Authorization: `Token ${TRADESVIZ_API_KEY}`
            }
          }
        );

        const statusJson = await statusRes.json();
        console.log(`🔎 Poll #${i + 1}:`, statusJson);

        if (statusJson.status === "completed") {
          finished = true;
          break;
        }
      }

      if (!finished) {
        return res.status(500).json({
          error: "TradesViz did not finish processing in time."
        });
      }

      // ------------------------------------------
      // 4️⃣ STEP 4 — Export enriched CSV
      // ------------------------------------------
      console.log("⬇️ Downloading enriched TradesViz CSV…");

      const exportRes = await fetch(
        "https://api.tradesviz.com/v1/export/trades/csv/",
        {
          method: "POST",
          headers: {
            Authorization: `Token ${TRADESVIZ_API_KEY}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            include_mae_mfe: true,
            include_risk: true,
            include_exits: true,
            include_positions: true
          })
        }
      );

      const csvText = await exportRes.text();
      console.log("📄 CSV length:", csvText.length);

      // ------------------------------------------
      // 5️⃣ STEP 5 — Return final CSV to frontend
      // ------------------------------------------

      return res.status(200).json({
        ok: true,
        csvLength: csvText.length,
        preview: csvText.slice(0, 500),
        fullCSV: csvText
      });

    } catch (e) {
      console.log("🔥 SERVER ERROR:", e);
      return res.status(500).json({
        error: "Server error",
        details: e.message
      });
    }
  });
}
