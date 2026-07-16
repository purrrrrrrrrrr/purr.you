/**
 * @param {{ currentTime: number, chapterDuration: number }} state
 * @param {number} delta
 */
export function seekBy({ currentTime, chapterDuration }, delta) {
  const target = currentTime + delta;
  if (target < 0) return 0;
  if (target > chapterDuration) return chapterDuration;
  return target;
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
