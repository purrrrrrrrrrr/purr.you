const TIMESTAMP = /^(\d{2}):(\d{2}):(\d{2})\.(\d{3})$/;

function parseTimestamp(s) {
  const m = TIMESTAMP.exec(s.trim());
  if (!m) return null;
  const [, hh, mm, ss, ms] = m;
  return Number(hh) * 3600 + Number(mm) * 60 + Number(ss) + Number(ms) / 1000;
}

export function parseVTT(input) {
  const lines = input.replace(/\r\n/g, '\n').split('\n');
  const cues = [];
  let i = 0;

  if (lines[i]?.startsWith('WEBVTT')) i++;

  while (i < lines.length) {
    while (i < lines.length && lines[i].trim() === '') i++;
    if (i >= lines.length) break;

    if (!lines[i].includes('-->')) {
      i++;
      if (i >= lines.length) break;
    }

    const arrow = lines[i].indexOf('-->');
    if (arrow === -1) { i++; continue; }
    const start = parseTimestamp(lines[i].slice(0, arrow));
    const endPart = lines[i].slice(arrow + 3).trim().split(/\s+/)[0];
    const end = parseTimestamp(endPart);
    i++;

    const textLines = [];
    while (i < lines.length && lines[i].trim() !== '') {
      textLines.push(lines[i]);
      i++;
    }

    if (start !== null && end !== null) {
      cues.push({ start, end, text: textLines.join('\n') });
    }
  }

  return cues;
}
