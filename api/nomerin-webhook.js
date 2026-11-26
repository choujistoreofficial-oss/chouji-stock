const crypto = require("crypto");
const { send, method } = require("./_lib/http");
const { db } = require("./_lib/supabase");

module.exports.config = { api: { bodyParser: false } };

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

function verifySignature(secret, header, raw) {
  if (!secret || !header) return false;
  const parts = Object.fromEntries(header.split(",").map(part => {
    const i = part.indexOf("=");
    return i < 0 ? [part, ""] : [part.slice(0, i).trim(), part.slice(i + 1).trim()];
  }));
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature || !/^\\d+$/.test(timestamp)) return false;
  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac("sha256", secret).update(`${timestamp}.`).update(raw).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

module.exports = async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;
  try {
    const raw = await rawBody(req);
    const signature = req.headers["x-nomerin-signature"];
    if (!verifySignature(process.env.NOMERIN_WEBHOOK_SECRET, signature, raw)) {
      return send(res, 401, { success: false, error: { code: "INVALID_SIGNATURE" } });
    }
    const payload = JSON.parse(raw.toString("utf8") || "{}");
    const event = req.headers["x-nomerin-event"] || payload.event || "unknown";
    const delivery = req.headers["x-nomerin-delivery"] || null;

    if (delivery) {
      try {
        await db("nomerin_webhook_events", {
          method: "POST",
          prefer: "return=minimal",
          body: [{ delivery_id: delivery, event_name: event, payload }]
        });
      } catch (e) {
        // Duplicate delivery ID: still return 200 so Nomerin stops retrying.
        if (e.status !== 409) throw e;
        return send(res, 200, { success: true, duplicate: true });
      }
    }

    const order = payload.order;
    if (order && order.id) {
      await db(`nomerin_orders?nomerin_order_id=eq.${Number(order.id)}`, {
        method: "PATCH",
        body: {
          status: order.status || event.replace("order.", ""),
          phone_number: order.number || null,
          otp_code: order.otp_code || null,
          provider_payload: order,
          last_event: event
        }
      });
    }
    return send(res, 200, { success: true });
  } catch (e) {
    console.error("Nomerin webhook error:", e.message);
    return send(res, 500, { success: false, error: { code: "WEBHOOK_PROCESSING_FAILED" } });
  }
};
