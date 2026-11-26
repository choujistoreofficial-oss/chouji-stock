const crypto = require("crypto");
const { method, requireInternal, send } = require("./_lib/http");
const { nomerin } = require("./_lib/nomerin");
const { db } = require("./_lib/supabase");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["POST"]) || !requireInternal(req, res)) return;
  try {
    const { service_id, country_id, price, external_id } = req.body || {};
    if (![service_id, country_id, price].every(v => Number.isInteger(Number(v)) && Number(v) > 0)) {
      return send(res, 400, { success: false, error: { code: "INVALID_BODY", message: "service_id, country_id, dan price wajib berupa angka positif." } });
    }
    const ext = String(external_id || `chouji-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`).slice(0, 64);
    const idem = crypto.createHash("sha256").update(ext).digest("hex").slice(0, 48);
    const result = await nomerin("/v1/orders", {
      method: "POST",
      headers: { "Idempotency-Key": idem },
      body: { service_id: Number(service_id), country_id: Number(country_id), price: Number(price), external_id: ext }
    });
    const order = result.data;
    await db("nomerin_orders?on_conflict=nomerin_order_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [{
        nomerin_order_id: order.id,
        external_id: order.external_id || ext,
        status: order.status,
        service_id: order.service?.id || Number(service_id),
        service_code: order.service?.code || null,
        service_name: order.service?.name || null,
        country_id: order.country?.id || Number(country_id),
        country_code: order.country?.code || null,
        country_name: order.country?.name || null,
        price: order.price || Number(price),
        phone_number: order.number || null,
        otp_code: order.otp_code || null,
        provider_payload: order
      }]
    });
    return send(res, 200, { success: true, data: order });
  } catch (e) { return handleError(res, e); }
};
