// @ts-nocheck
const KEY = (id) => `interviews:${id}`;

export function saveProgress(databunId, { chapterIndex, currentTime }) {
  localStorage.setItem(KEY(databunId), JSON.stringify({ chapterIndex, currentTime }));
}

export function loadProgress(databunId) {
  const raw = localStorage.getItem(KEY(databunId));
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed.chapterIndex !== 'number') return null;
    if (typeof parsed.currentTime !== 'number') return null;
    return { chapterIndex: parsed.chapterIndex, currentTime: parsed.currentTime };
  } catch {
    return null;
  }
}

export function clearProgress(databunId) {
  localStorage.removeItem(KEY(databunId));
}
