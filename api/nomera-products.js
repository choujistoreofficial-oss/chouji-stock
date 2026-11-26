import { method, send, handleError } from './_lib/http.js';
import { nomera } from './_lib/nomera.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  const serviceId = String(req.query?.serviceId || '');
  if (!/^\d+$/.test(serviceId)) return send(res, 400, { success: false, code: 'INVALID_SERVICE_ID' });
  try { const result = await nomera('/otp/service-products?' + new URLSearchParams({ serviceId })); return send(res, 200, result.data); }
  catch (error) { return handleError(res, error); }
}
