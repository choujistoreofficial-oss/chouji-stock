function config() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error("SUPABASE_URL dan SUPABASE_SECRET_KEY belum diatur"), { status: 500, code: "CONFIG_MISSING" });
  return { url: url.replace(/\/+$/, ""), key };
}

async function db(path, options = {}) {
  const { url, key } = config();
  const response = await fetch(`${url}/rest/v1/${path}`, {
    method: options.method || "GET",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {})
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const err = new Error(data?.message || `Supabase HTTP ${response.status}`);
    err.status = response.status;
    err.code = "SUPABASE_ERROR";
    err.details = data;
    throw err;
  }
  return data;
}

module.exports = { db };
