export function send(res, status, payload) {
  return res.status(status).json(payload);
}

export function method(req, res, allowed) {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.origin;
    const allowedOrigin = process.env.CHOUJI_ALLOWED_ORIGIN;
    if (allowedOrigin && origin === allowedOrigin) {
      res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    res.status(204).end();
    return false;
  }
  if (!allowed.includes(req.method)) {
    res.setHeader('Allow', allowed.join(', '));
    send(res, 405, { success: false, code: 'METHOD_NOT_ALLOWED' });
    return false;
  }
  const origin = req.headers.origin;
  const allowedOrigin = process.env.CHOUJI_ALLOWED_ORIGIN;
  if (allowedOrigin && origin && origin !== allowedOrigin) {
    send(res, 403, { success: false, code: 'ORIGIN_NOT_ALLOWED' });
    return false;
  }
  if (allowedOrigin && origin === allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  }
  res.setHeader('Cache-Control', 'no-store');
  return true;
}

export function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
  if (typeof raw === 'string' && raw.trim()) {
    try { return JSON.parse(raw); } catch { throw Object.assign(new Error('JSON body tidak valid.'), { status: 400, code: 'INVALID_JSON' }); }
  }
  return {};
}

export function handleError(res, error) {
  const status = Number.isInteger(error?.status) ? error.status : 502;
  const payload = {
    success: false,
    code: error?.code || 'BACKEND_ERROR',
    message: error?.message || 'Permintaan gagal.',
  };
  if (error?.httpStatus) payload.providerHttpStatus = error.httpStatus;
  if (error?.requestId) payload.requestId = error.requestId;
  if (Number.isFinite(error?.retryAfterSeconds) && error.retryAfterSeconds > 0) payload.retryAfterSeconds = error.retryAfterSeconds;
  return send(res, status, payload);
      }
