const BASE = () => (process.env.NOMERA_BASE_URL || 'https://nomera.cloud/api/v1').replace(/\/+$/, '');

function apiKey() {
  const value = process.env.NOMERA_API_KEY;
  if (!value || value.startsWith('ISI_')) throw Object.assign(new Error('NOMERA_API_KEY belum diatur di Vercel.'), { status: 500, code: 'KEY_NOT_CONFIGURED' });
  return value;
}

export async function nomera(path, { method = 'GET', body } = {}) {
  if (!/^\/(otp|deposits)\//.test(path) || /[\r\n#]/.test(path)) throw Object.assign(new Error('Path Nomera tidak valid.'), { status: 400, code: 'INVALID_PATH' });
  const url = new URL(BASE() + path);
  if (url.protocol !== 'https:' || url.hostname !== 'nomera.cloud') throw Object.assign(new Error('Base URL Nomera tidak diizinkan.'), { status: 500, code: 'INVALID_BASE_URL' });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 18000);
  try {
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${apiKey()}`,
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const meta = { httpStatus: response.status, requestId: response.headers.get('x-nomera-request-id') || undefined };
    let data;
    try { data = await response.json(); }
    catch { throw Object.assign(new Error('Respons Nomera bukan JSON.'), { ...meta, code: 'INVALID_RESPONSE' }); }
    if (!response.ok || data?.success !== true) {
      const retryHeader = response.headers.get('retry-after');
      const retryAfterSeconds = Number(data?.retryAfterSeconds || retryHeader || 0);
      throw Object.assign(new Error(data?.message || 'Permintaan Nomera gagal.'), {
        ...meta,
        status: response.status === 429 ? 429 : 502,
        code: data?.code || 'NOMERA_API_ERROR',
        retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 0,
      });
    }
    return { data, ...meta };
  } catch (error) {
    if (controller.signal.aborted) throw Object.assign(new Error('Request ke Nomera timeout. Untuk create-order, gunakan idempotencyKey yang sama.'), { code: 'REQUEST_TIMEOUT', status: 504 });
    if (error?.code) throw error;
    throw Object.assign(new Error('Koneksi ke Nomera gagal.'), { code: 'NETWORK_ERROR', status: 502 });
  } finally { clearTimeout(timer); }
}

export function validIdempotencyKey(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,128}$/.test(value);
}
