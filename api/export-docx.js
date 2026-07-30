// api/export-docx.js
// Converts already-generated briefing Markdown into a downloadable .docx file.
// Requires the "docx" package (see package.json). No Anthropic API call happens here —
// this just formats content the client already has from /api/generate-briefing.

const { buildDocxBuffer } = require('../lib/build-docx');

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
  const title = (body.title || 'Briefing Book').toString().slice(0, 200);

  try {
    const buffer = await buildDocxBuffer(markdown, title);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', 'attachment; filename="briefing_book.docx"');
    res.end(buffer);
  } catch (err) {
    res.status(500).json({ error: 'Failed to build the Word document: ' + (err && err.message ? err.message : String(err)) });
  }
};
