
const { method, send } = require("./_lib/http");
const { requireCustomer } = require("./_lib/customer-auth");
const { db } = require("./_lib/supabase");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;

  const user = await requireCustomer(req, res);
  if (!user) return;

  try {
    const rows = await db(
      `nomerin_orders?user_id=eq.${encodeURIComponent(user.id)}&order=nomerin_order_id.desc&limit=50`
    );

    const data = (Array.isArray(rows) ? rows : []).map(order => ({
      order_id: order.nomerin_order_id,
      external_id: order.external_id,
      status: order.status,
      service_name: order.service_name,
      country_name: order.country_name,
      price: order.price,
      phone_number: order.phone_number,
      otp_code: order.otp_code
    }));

    return send(res, 200, {
      success: true,
      data
    });
  } catch (e) {
    return handleError(res, e);
  }
};
