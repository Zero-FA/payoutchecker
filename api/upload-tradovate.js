import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false, // required for file uploads
  },
};

const TRADESVIZ_API_KEY = process.env.TRADESVIZ_API_KEY;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  console.log("🔥 API HIT: POST");

  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Parse error:", err);
      return res.status(500).json({ error: "Failed to parse form-data" });
    }

    const file = files.file?.[0];
    console.log("📂 Parsed file:", file ? {
      original: file.originalFilename,
      path: file.filepath,
      size: file.size
    } : "NO FILE FOUND");

    if (!file || !file.filepath) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    try {
console.log("⬆️ Uploading file to TradesViz…");

const uploadRes = await fetch(
  "https://api.tradesviz.com/v1/import/trades/broker/csv/?broker=tradovate",
  {
    method: "POST",
    headers: {
      Authorization: `Token ${TRADESVIZ_API_KEY}`,
    },
    body: fs.createReadStream(file.filepath),
    redirect: "manual"
  }
);

const text = await uploadRes.text();
console.log("📥 Upload response:", uploadRes.status, text);

let uploadJson = null;
try {
  uploadJson = JSON.parse(text);
} catch (err) {
  console.error("JSON parse fail (likely HTML or redirect)");
}
      // return success
      res.status(200).json({
        ok: true,
        message: "CSV uploaded to TradesViz",
        upload: uploadJson
      });

    } catch (e) {
      console.error("🔥 SERVER ERROR:", e);
      res.status(500).json({ error: "Server error", detail: e.message });
    }
  });
}
