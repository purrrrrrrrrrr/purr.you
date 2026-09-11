export function load({ params }) {
	return { issue: params.issue as '001' | '002' };
}
