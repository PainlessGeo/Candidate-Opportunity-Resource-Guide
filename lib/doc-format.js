// lib/doc-format.js
// Lightweight Markdown -> block parser shared by the DOCX and PDF export functions.
// Supports exactly the subset of Markdown the briefing-generation prompt produces:
// # / ## / ### headers, - or * bullets, blank-line-separated paragraphs, **bold**
// inline spans, and --- horizontal rules. Not a general-purpose Markdown parser —
// deliberately narrow so behavior stays predictable across both exporters.

function parseInline(text) {
  // Splits a line into [{ text, bold }] segments on **bold** markers.
  const segments = [];
  const re = /\*\*(.+?)\*\*/g;
  let lastIndex = 0;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), bold: false });
    }
    segments.push({ text: match[1], bold: true });
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), bold: false });
  }
  return segments.length ? segments : [{ text, bold: false }];
}

function parseMarkdown(markdown) {
  const lines = (markdown || '').replace(/\r\n/g, '\n').split('\n');
  const blocks = [];
  let paragraphBuffer = [];

  function flushParagraph() {
    if (paragraphBuffer.length) {
      blocks.push({ type: 'p', text: paragraphBuffer.join(' ').trim() });
      paragraphBuffer = [];
    }
  }

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    const trimmed = line.trim();

    if (!trimmed.length) {
      flushParagraph();
      continue;
    }
    if (/^-{3,}$/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'hr' });
      continue;
    }
    let m;
    if ((m = /^###\s+(.*)$/.exec(trimmed))) {
      flushParagraph();
      blocks.push({ type: 'h3', text: m[1] });
      continue;
    }
    if ((m = /^##\s+(.*)$/.exec(trimmed))) {
      flushParagraph();
      blocks.push({ type: 'h2', text: m[1] });
      continue;
    }
    if ((m = /^#\s+(.*)$/.exec(trimmed))) {
      flushParagraph();
      blocks.push({ type: 'h1', text: m[1] });
      continue;
    }
    if ((m = /^[-*]\s+(.*)$/.exec(trimmed))) {
      flushParagraph();
      blocks.push({ type: 'li', text: m[1] });
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph();
      blocks.push({ type: 'li', text: trimmed.replace(/^\d+\.\s+/, '') });
      continue;
    }
    paragraphBuffer.push(trimmed);
  }
  flushParagraph();
  return blocks;
}

module.exports = { parseMarkdown, parseInline };
