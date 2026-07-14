import { createHash, timingSafeEqual } from 'crypto';
import { env } from '$env/dynamic/private';

const ADMIN_PASSWORD = env.PURR_NET_ADMIN_PASSWORD ?? 'furzik-net-dev';
const SECRET = env.PURR_NET_ADMIN_SECRET ?? 'purr-net-dev-secret';

export const AUTH_COOKIE = 'purr_net_admin';

function tokenFor(password: string): string {
	return createHash('sha256').update(`${password}:${SECRET}`).digest('hex');
}

export function checkPassword(password: string): boolean {
	return password === ADMIN_PASSWORD;
}

export function issueToken(): string {
	return tokenFor(ADMIN_PASSWORD);
}

export function isValidToken(token: string | undefined): boolean {
	if (!token) return false;
	const expected = Buffer.from(issueToken());
	const actual = Buffer.from(token);
	return expected.length === actual.length && timingSafeEqual(expected, actual);
}
