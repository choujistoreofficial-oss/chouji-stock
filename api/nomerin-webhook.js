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

function verifySignature(secret, header, raw, now = Date.now()) {
  if (!secret || typeof header !== "string" || !header) return false;
  const parts = {};
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 1) continue;
    parts[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !/^\d+$/.test(timestamp) || !/^[a-f0-9]{64}$/i.test(signature || "")) return false;
  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto.createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest();
  const received = Buffer.from(signature, "hex");
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;
  try {
    const raw = await rawBody(req);
    const signature = req.headers["x-nomerin-signature"];
    if (!verifySignature(process.env.NOMERIN_WEBHOOK_SECRET, signature, raw)) {
      return send(res, 401, { success: false, error: { code: "INVALID_SIGNATURE" } });
    }

    let payload;
    try {
      payload = JSON.parse(raw.toString("utf8") || "{}");
    } catch {
      return send(res, 400, { success: false, error: { code: "INVALID_JSON" } });
    }

    const event = req.headers["x-nomerin-event"] || payload.event || "unknown";
    const delivery = req.headers["x-nomerin-delivery"] || null;
    const order = payload.order && Number.isInteger(Number(payload.order.id)) ? payload.order : null;

    // Delivery IDs can change between retries. Fingerprint the logical event too,
    // so repeated order.status + otp_code notifications are recorded only once.
    const fingerprintSource = order
      ? [event, Number(order.id), order.status || "", order.otp_code || ""].join("|")
      : [event, payload.created_at || "", delivery || crypto.createHash("sha256").update(raw).digest("hex")].join("|");
    const fingerprint = crypto.createHash("sha256").update(fingerprintSource).digest("hex");

    try {
      await db("nomerin_webhook_events?on_conflict=event_fingerprint", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: [{
          delivery_id: delivery,
          event_name: event,
          event_fingerprint: fingerprint,
          payload
        }]
      });
    } catch (e) {
      // A repeated delivery_id is also harmless; continue to apply the order state.
      if (e.status !== 409) throw e;
    }

    if (order && Number(order.id) > 0) {
      await db(`nomerin_orders?nomerin_order_id=eq.${Number(order.id)}`, {
        method: "PATCH",
        body: {
          status: order.status || event.replace(/^order\./, ""),
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

module.exports = handler;
module.exports.verifySignature = verifySignature;
