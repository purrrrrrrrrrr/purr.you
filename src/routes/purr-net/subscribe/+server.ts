import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { addSubscriber } from '$lib/server/purrNetStore';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: RequestHandler = async ({ request }) => {
	const { email } = await request.json();

	if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
		return json({ error: 'Invalid email' }, { status: 400 });
	}

	await addSubscriber(email.trim());
	return json({ ok: true });
};
