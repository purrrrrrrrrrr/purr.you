/** @param {string} id */
const KEY = (id) => `interviews:${id}`;

/**
 * @param {string} databunId
 * @param {{ chapterIndex: number, currentTime: number }} progress
 */
export function saveProgress(databunId, { chapterIndex, currentTime }) {
  localStorage.setItem(KEY(databunId), JSON.stringify({ chapterIndex, currentTime }));
}

/** @param {string} databunId */
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

/** @param {string} databunId */
export function clearProgress(databunId) {
  localStorage.removeItem(KEY(databunId));
}
