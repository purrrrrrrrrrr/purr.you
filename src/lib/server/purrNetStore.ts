import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

const DATA_DIR = path.resolve('data');
const DATA_FILE = path.join(DATA_DIR, 'purr-net-subscribers.json');

export interface Subscriber {
	email: string;
	createdAt: string;
}

async function readAll(): Promise<Subscriber[]> {
	try {
		const raw = await readFile(DATA_FILE, 'utf-8');
		return JSON.parse(raw) as Subscriber[];
	} catch {
		return [];
	}
}

export async function listSubscribers(): Promise<Subscriber[]> {
	const subscribers = await readAll();
	return subscribers.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function addSubscriber(email: string): Promise<void> {
	const subscribers = await readAll();
	if (subscribers.some((s) => s.email.toLowerCase() === email.toLowerCase())) return;

	subscribers.push({ email, createdAt: new Date().toISOString() });
	await mkdir(DATA_DIR, { recursive: true });
	await writeFile(DATA_FILE, JSON.stringify(subscribers, null, 2), 'utf-8');
}
