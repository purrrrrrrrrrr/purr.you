/** @param {string} id */
export async function loadDatabun(id) {
  const manifestUrl = `/databuns/${id}/databun.json?v=${Date.now()}`;
  const res = await fetch(manifestUrl, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load databun ${id}: ${res.status}`);
  return res.json();
}
