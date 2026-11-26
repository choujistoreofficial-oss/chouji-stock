const BASE = (process.env.NOMERIN_BASE_URL || "https://api.nomerin.id").replace(/\/+$/, "");

async function nomerin(path, options = {}) {
  const key = process.env.NOMERIN_API_KEY;
  if (!key) throw Object.assign(new Error("NOMERIN_API_KEY belum diatur"), { status: 500, code: "CONFIG_MISSING" });

  const headers = {
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    ...(options.headers || {})
  };

  let body;
  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body
  });

  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { data = { success: false, error: { code: "INVALID_PROVIDER_RESPONSE", message: raw.slice(0, 500) } }; }

  if (!response.ok || data.success === false) {
    const err = new Error(data?.error?.message || `Nomerin HTTP ${response.status}`);
    err.status = response.status;
    err.code = data?.error?.code || "NOMERIN_ERROR";
    err.details = data?.error?.details;
    throw err;
  }
  return data;
}

module.exports = { nomerin };
