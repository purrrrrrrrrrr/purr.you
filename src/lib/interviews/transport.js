/**
 * @param {{ currentTime: number, chapterDuration: number }} state
 * @param {number} delta
 */
export function seekBy({ currentTime, chapterDuration }, delta) {
  const target = currentTime + delta;
  if (target < 0) return 0;
  if (chapterDuration > 0 && target > chapterDuration) return chapterDuration;
  return target;
}

/**
 * Resolve a relative seek across chapter boundaries.
 * @param {{ chapterIndex: number, currentTime: number, chapterDurations: number[] }} state
 * @param {number} delta
 */
export function seekAcrossChapters({ chapterIndex, currentTime, chapterDurations }, delta) {
  let index = chapterIndex;
  let target = currentTime + delta;

  while (target < 0 && index > 0) {
    index--;
    target += Math.max(0, chapterDurations[index] || 0);
  }

  while (index < chapterDurations.length - 1) {
    const duration = Math.max(0, chapterDurations[index] || 0);
    if (target < duration) break;
    target -= duration;
    index++;
  }

  const duration = Math.max(0, chapterDurations[index] || 0);
  return {
    chapterIndex: index,
    currentTime: Math.min(Math.max(0, target), duration)
  };
}

/**
 * @param {number} index
 * @param {number} total
 */
export function prevChapter(index, total) {
  return index > 0 ? index - 1 : 0;
}

/**
 * @param {number} index
 * @param {number} total
 */
export function nextChapter(index, total) {
  return index < total - 1 ? index + 1 : index;
}

/**
 * @param {number} index
 * @param {number} total
 */
export function isLastChapter(index, total) {
  return index === total - 1;
}
