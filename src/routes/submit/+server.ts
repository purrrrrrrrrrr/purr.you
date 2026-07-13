import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const response = await fetch('http://127.0.0.1:5001', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body,
	});
	return new Response(await response.text(), {
		status: response.status,
		headers: { 'Content-Type': 'application/json' },
	});
};
