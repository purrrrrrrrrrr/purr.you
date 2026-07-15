// @ts-nocheck
export function seekBy({ currentTime, chapterDuration }, delta) {
  const target = currentTime + delta;
  if (target < 0) return 0;
  if (target > chapterDuration) return chapterDuration;
  return target;
}

export function prevChapter(index, total) {
  return index > 0 ? index - 1 : 0;
}

export function nextChapter(index, total) {
  return index < total - 1 ? index + 1 : index;
}

export function isLastChapter(index, total) {
  return index === total - 1;
}
