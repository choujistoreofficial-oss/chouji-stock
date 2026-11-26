import { method, send, handleError } from './_lib/http.js';
import { nomera } from './_lib/nomera.js';
import { authenticatedUser } from './_lib/supabase.js';
import { findOwnedOrder, saveOrderSnapshot } from './_lib/owned-order.js';
export default async function handler(req, res) {
  if (!method(req, res, ['GET'])) return;
  try {
    const user = await authenticatedUser(req);
    const orderId = String(req.query?.orderId || '');
    if (!orderId) return send(res, 400, { success: false, code: 'ORDER_ID_REQUIRED' });
    const { db, row } = await findOwnedOrder(user.id, orderId);
    const result = await nomera('/otp/my-order/' + encodeURIComponent(orderId));
    await saveOrderSnapshot(db, row, result.data);
    return send(res, 200, result.data);
  } catch (error) { return handleError(res, error); }
}
