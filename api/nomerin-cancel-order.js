const { method, requireInternal, send } = require("./_lib/http");
const { nomerin } = require("./_lib/nomerin");
const { db } = require("./_lib/supabase");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !requireInternal(req, res)) return;
  const id = Number(req.body?.order_id);
  if (!Number.isInteger(id) || id < 1) return send(res, 400, { success: false, error: { code: "INVALID_ORDER_ID" } });
  try {
    const result = await nomerin(`/v1/orders/${id}/cancel`, { method: "POST", body: {} });
    const order = result.data;
    await db(`nomerin_orders?nomerin_order_id=eq.${id}`, {
      method: "PATCH",
      body: { status: order.status, phone_number: order.number || null, otp_code: order.otp_code || null, provider_payload: order }
    });
    return send(res, 200, { success: true, data: order });
  } catch (e) { return handleError(res, e); }
};
