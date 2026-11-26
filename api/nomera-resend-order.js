import { method, readBody, send, handleError } from './_lib/http.js';
import { nomera } from './_lib/nomera.js';
import { authenticatedUser } from './_lib/supabase.js';
import { findOwnedOrder, saveOrderSnapshot } from './_lib/owned-order.js';
export default async function handler(req, res) {
  if (!method(req, res, ['POST'])) return;
  try {
    const user = await authenticatedUser(req);
    const { orderId = '' } = readBody(req);
    const id = String(orderId);
    if (!id) return send(res, 400, { success: false, code: 'ORDER_ID_REQUIRED' });
    const { db, row } = await findOwnedOrder(user.id, id);
    const snapshot = await nomera('/otp/my-order/' + encodeURIComponent(id));
    const order = snapshot.data.order || snapshot.data;
    if (order.canResend !== true) {
      await saveOrderSnapshot(db, row, snapshot.data);
      return send(res, 409, { success: false, code: 'RESEND_NOT_ALLOWED', order: snapshot.data });
    }
    const result = await nomera('/otp/resend-order', { method: 'POST', body: { orderId: id } });
    await saveOrderSnapshot(db, row, result.data);
    return send(res, 200, result.data);
  } catch (error) { return handleError(res, error); }
}
