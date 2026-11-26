
const { method, send } = require("./_lib/http");
const { requireCustomer } = require("./_lib/customer-auth");
const { nomerin } = require("./_lib/nomerin");
const { db } = require("./_lib/supabase");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;

  const user = await requireCustomer(req, res);
  if (!user) return;

  const id = Number(req.query.order_id);

  if (!Number.isSafeInteger(id) || id < 1) {
    return send(res, 400, {
      success: false,
      error: { code: "INVALID_ORDER_ID" }
    });
  }

  try {
    const rows = await db(
      `nomerin_orders?nomerin_order_id=eq.${id}&user_id=eq.${encodeURIComponent(user.id)}&select=nomerin_order_id`
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return send(res, 404, {
        success: false,
        error: { code: "ORDER_NOT_FOUND" }
      });
    }

    const result = await nomerin(`/v1/orders/${id}`);
    const order = result.data;

    await db(`nomerin_orders?nomerin_order_id=eq.${id}&user_id=eq.${encodeURIComponent(user.id)}`, {
      method: "PATCH",
      body: {
        status: order.status,
        phone_number: order.number || null,
        otp_code: order.otp_code || null,
        provider_payload: order
      }
    });

    return send(res, 200, {
      success: true,
      data: {
        order_id: order.id,
        status: order.status,
        phone_number: order.number || null,
        otp_code: order.otp_code || null
      }
    });
  } catch (e) {
    return handleError(res, e);
  }
};
