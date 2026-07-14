import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { AUTH_COOKIE, checkPassword, isValidToken, issueToken } from '$lib/server/purrNetAuth';
import { listSubscribers } from '$lib/server/purrNetStore';

export const load: PageServerLoad = async ({ cookies }) => {
	const authed = isValidToken(cookies.get(AUTH_COOKIE));
	if (!authed) return { authed: false as const, subscribers: [] };

	return { authed: true as const, subscribers: await listSubscribers() };
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const data = await request.formData();
		const password = String(data.get('password') ?? '');

		if (!checkPassword(password)) {
			return fail(401, { error: 'Wrong password' });
		}

		cookies.set(AUTH_COOKIE, issueToken(), {
			path: '/purr-net/admin',
			httpOnly: true,
			sameSite: 'strict',
			maxAge: 60 * 60 * 8
		});
		return { success: true };
	},

	logout: async ({ cookies }) => {
		cookies.delete(AUTH_COOKIE, { path: '/purr-net/admin' });
		return { success: true };
	}
};
