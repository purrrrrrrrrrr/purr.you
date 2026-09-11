import type { ParamMatcher } from '@sveltejs/kit';

export const match: ParamMatcher = (param) => param === '001' || param === '002';
