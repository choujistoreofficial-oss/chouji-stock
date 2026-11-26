import { method, send, handleError } from './_lib/http.js';
import { nomera } from './_lib/nomera.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try { const result = await nomera('/otp/catalog'); return send(res, 200, result.data); }
  catch (error) { return handleError(res, error); }
}
