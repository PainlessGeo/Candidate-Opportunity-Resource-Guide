// lib/build-docx.js
const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  LevelFormat, AlignmentType, BorderStyle,
} = require('docx');
const { parseMarkdown, parseInline } = require('./doc-format');

const LETTER = { width: 12240, height: 15840 }; // US Letter, DXA

function runsFor(text) {
  return parseInline(text).map(
    (seg) => new TextRun({ text: seg.text, bold: seg.bold })
  );
}

async function buildDocxBuffer(markdown, title) {
  const blocks = parseMarkdown(markdown);
  const children = [];

  for (const block of blocks) {
    if (block.type === 'h1') {
      children.push(new Paragraph({
        children: runsFor(block.text),
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
      }));
    } else if (block.type === 'h2') {
      children.push(new Paragraph({
        children: runsFor(block.text),
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 300, after: 150 },
      }));
    } else if (block.type === 'h3') {
      children.push(new Paragraph({
        children: runsFor(block.text),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 100 },
      }));
    } else if (block.type === 'li') {
      children.push(new Paragraph({
        children: runsFor(block.text),
        numbering: { reference: 'bullets', level: 0 },
        spacing: { after: 80 },
      }));
    } else if (block.type === 'hr') {
      children.push(new Paragraph({
        text: '',
        border: {
          bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 },
        },
        spacing: { after: 200 },
      }));
    } else if (block.text) {
      children.push(new Paragraph({
        children: runsFor(block.text),
        spacing: { after: 120 },
      }));
    }
  }

  if (!children.length) {
    children.push(new Paragraph({ text: 'No content was provided to export.' }));
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'bullets',
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: '•',
          alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 360, hanging: 260 } } },
        }],
      }],
    },
    sections: [{
      properties: {
        page: { size: LETTER, margin: { top: 1080, bottom: 1080, left: 1080, right: 1080 } },
      },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

module.exports = { buildDocxBuffer };
