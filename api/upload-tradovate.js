import formidable from "formidable";
import fs from "fs";
import fetch from "node-fetch";

export const config = {
  api: {
    bodyParser: false
  }
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // Parse uploaded file
  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ error: "Upload error" });

    const filePath = files.file.filepath;

    // Prepare upload to TradesViz
    const formData = new FormData();
    formData.append("file", fs.createReadStream(filePath), files.file.originalFilename);
    formData.append("format", "tradovate");
    formData.append("is_async", "false");

    // Send to TradesViz
    const tvResponse = await fetch("https://api.tradesviz.com/api/v1/import/tradescsv/", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.TRADESVIZ_API_KEY}`
      },
      body: formData
    });

    const data = await tvResponse.json();

    if (!data.success) {
      return res.status(400).json({ error: data });
    }

    // Return all processed trade data to front-end
    return res.status(200).json({
      imported: true,
      trades: data.trades
    });
  });
}
