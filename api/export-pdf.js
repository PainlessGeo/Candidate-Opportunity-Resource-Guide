// api/export-pdf.js
// Converts already-generated briefing Markdown into a downloadable .pdf file using
// pdfkit (pure JS, no headless browser / system binaries needed — safe on Vercel's
// standard Node serverless runtime). No Anthropic API call happens here.

const { buildPdfBuffer } = require('../lib/build-pdf');

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const MAX_MARKDOWN_LEN = 200000;

module.exports = async (req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  let body = req.body;
  if (!body || typeof body !== 'object') {
    try {
      body = JSON.parse(body || '{}');
    } catch (e) {
      res.status(400).json({ error: 'Invalid JSON body.' });
      return;
    }
  }

  const markdown = (body.markdown || '').toString().slice(0, MAX_MARKDOWN_LEN);
  if (!markdown.trim()) {
    res.status(400).json({ error: 'No briefing content provided to export.' });
    return;
  }

  try {
    const buffer = await buildPdfBuffer(markdown);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="briefing_book.pdf"');
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to build the PDF: ' + (err && err.message ? err.message : String(err)) });
  }
};
