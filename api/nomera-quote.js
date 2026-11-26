import { method, send, handleError } from './_lib/http.js';
import { nomera } from './_lib/nomera.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  const { serviceId = '', countryId = '', offerKey = '' } = req.query || {};
  if (!/^\d+$/.test(String(serviceId)) || !/^\d+$/.test(String(countryId)) || !String(offerKey)) return send(res, 400, { success: false, code: 'INVALID_SELECTION' });
  try {
    const result = await nomera('/otp/quote?' + new URLSearchParams({ serviceId: String(serviceId), countryId: String(countryId), offerKey: String(offerKey) }));
    if (result.data.available !== true) return send(res, 409, { success: false, code: 'OFFER_UNAVAILABLE', quote: result.data });
    return send(res, 200, result.data);
  } catch (error) { return handleError(res, error); }
}
