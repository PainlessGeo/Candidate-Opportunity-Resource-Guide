// lib/build-pdf.js
const PDFDocument = require('pdfkit');
const { parseMarkdown, parseInline } = require('./doc-format');

const NAVY = '#0d1526';
const TEXT = '#1e293b';
const ACCENT = '#1d4ed8';
const RULE = '#dddddd';

function buildPdfBuffer(markdown) {
  const blocks = parseMarkdown(markdown);

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 54, size: 'LETTER', bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      function writeInline(text) {
        const segments = parseInline(text);
        segments.forEach((seg, i) => {
          doc
            .font(seg.bold ? 'Helvetica-Bold' : 'Helvetica')
            .fillColor(TEXT)
            .text(seg.text, { continued: i < segments.length - 1 });
        });
      }

      if (!blocks.length) {
        doc.font('Helvetica').fontSize(11).fillColor(TEXT).text('No content was provided to export.');
      }

      blocks.forEach((block) => {
        if (block.type === 'h1') {
          doc.moveDown(0.4);
          doc.font('Helvetica-Bold').fontSize(18).fillColor(NAVY).text(block.text);
          doc.moveDown(0.3);
        } else if (block.type === 'h2') {
          doc.moveDown(0.6);
          doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY).text(block.text);
          doc.moveDown(0.2);
        } else if (block.type === 'h3') {
          doc.moveDown(0.4);
          doc.font('Helvetica-Bold').fontSize(12).fillColor(ACCENT).text(block.text);
          doc.moveDown(0.15);
        } else if (block.type === 'li') {
          doc.fontSize(10.5);
          doc.font('Helvetica').fillColor(TEXT).text('•  ', {
            continued: true,
            indent: 14,
          });
          writeInline(block.text);
          doc.moveDown(0.15);
        } else if (block.type === 'hr') {
          doc.moveDown(0.3);
          const y = doc.y;
          doc
            .moveTo(doc.page.margins.left, y)
            .lineTo(doc.page.width - doc.page.margins.right, y)
            .strokeColor(RULE)
            .stroke();
          doc.moveDown(0.5);
        } else if (block.text) {
          doc.fontSize(10.5);
          writeInline(block.text);
          doc.moveDown(0.4);
        }
      });

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = { buildPdfBuffer };
