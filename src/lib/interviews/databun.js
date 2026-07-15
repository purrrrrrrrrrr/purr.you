// @ts-nocheck
export async function loadDatabun(id) {
  const res = await fetch(`/databuns/${id}/databun.json`);
  if (!res.ok) throw new Error(`Failed to load databun ${id}: ${res.status}`);
  return res.json();
}
