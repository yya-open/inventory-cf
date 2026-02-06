export async function apiGet<T>(path: string) {
  const r = await fetch(path, { method: "GET" });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}

export async function apiPost<T>(path: string, body: any) {
  const r = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json();
  if (!r.ok || !j.ok) throw new Error(j.message || "请求失败");
  return j as T;
}
