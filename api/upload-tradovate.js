import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false, // required for form-data file uploads
  },
};

const TRADESVIZ_API_KEY = process.env.TRADESVIZ_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("🔥 API HIT: POST");

  // Create formidable instance
  const form = formidable({
    multiples: false,
    keepExtensions: true
  });

  // Parse incoming multipart form-data
  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("❌ Form parse error:", err);
      return res.status(500).json({ error: "Failed to parse upload form" });
    }

    // File will be under files.file[0] because of your frontend
    const uploaded = files.file?.[0];

    console.log("📂 Parsed file:", uploaded ? {
      original: uploaded.originalFilename,
      path: uploaded.filepath,
      size: uploaded.size
    } : "NO FILE FOUND");

    if (!uploaded || !uploaded.filepath) {
      return res.status(400).json({ error: "No CSV uploaded" });
    }

    try {
      console.log("⬆️ Uploading file to TradesViz…");

      // IMPORTANT: this is the REAL endpoint (not /v1/)
      const TV_URL =
        "https://api.tradesviz.com/import/trades/broker/csv/?broker=tradovate";

      const uploadRes = await fetch(TV_URL, {
        method: "POST",
        headers: {
          Authorization: `Token ${TRADESVIZ_API_KEY}`,
          // DO NOT set Content-Type manually — fetch handles it when streaming
        },
        body: fs.createReadStream(uploaded.filepath),
        redirect: "manual" // prevent stream redirect failures
      });

      const text = await uploadRes.text();

      console.log("📥 Upload response:", uploadRes.status, text);

      // Try JSON parse — but may return HTML if the API key is wrong or URL invalid
      let uploadJson = null;
      try {
        uploadJson = JSON.parse(text);
      } catch (err) {
        console.error("❌ JSON parse error — HTML received instead of JSON");
      }

      // If not JSON or not success, return raw text for debugging
      if (!uploadJson || !uploadJson.success) {
        return res.status(500).json({
          error: "TradesViz upload failed",
          status: uploadRes.status,
          raw: text
        });
      }

      // Success!
      return res.status(200).json({
        ok: true,
        upload: uploadJson
      });

    } catch (e) {
      console.error("🔥 SERVER ERROR:", e);
      return res.status(500).json({
        error: "Server encountered an error",
        detail: e.message
      });
    }
  });
}
