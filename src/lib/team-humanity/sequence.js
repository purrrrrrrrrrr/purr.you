// src/lib/team-humanity/sequence.js

/**
 * @param {{chapters: {audio: string}[]}[]} people
 * @param {{personIndex: number, chapterIndex: number}} position
 */
export function nextPosition(people, position) {
	const chapterCount = people[position.personIndex].chapters.length;
	if (position.chapterIndex < chapterCount - 1) {
		return { personIndex: position.personIndex, chapterIndex: position.chapterIndex + 1 };
	}
	const personIndex = (position.personIndex + 1) % people.length;
	return { personIndex, chapterIndex: 0 };
}

/**
 * @param {{chapters: {audio: string}[]}[]} people
 * @param {{personIndex: number, chapterIndex: number}} position
 */
export function prevPosition(people, position) {
	if (position.chapterIndex > 0) {
		return { personIndex: position.personIndex, chapterIndex: position.chapterIndex - 1 };
	}
	const personIndex = (position.personIndex - 1 + people.length) % people.length;
	const chapterCount = people[personIndex].chapters.length;
	return { personIndex, chapterIndex: chapterCount - 1 };
}

/**
 * @param {string} uuid
 * @param {{audio: string}} chapter
 */
export function chapterAudioUrl(uuid, chapter) {
	return `/team-humanity/${uuid}/${chapter.audio}`;
}
