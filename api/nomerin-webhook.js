
const crypto = require("crypto");
const { send, method } = require("./_lib/http");
const { db } = require("./_lib/supabase");

module.exports.config = {
  api: { bodyParser: false }
};

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") {
    return Buffer.from(req.body);
  }

  const chunks = [];

  for await (const chunk of req) {
    chunks.push(
      Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

function verifySignature(secret, header, raw) {
  if (!secret || typeof header !== "string") return false;

  const parts = {};

  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index < 1) continue;

    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();

    parts[key] = value;
  }

  const timestamp = parts.t;
  const signature = parts.v1;

  if (!timestamp || !/^\d+$/.test(timestamp)) return false;
  if (!/^[a-f0-9]{64}$/i.test(signature || "")) return false;

  if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
    return false;
  }

  const expected = crypto
    .createHmac("sha256", secret)
    .update(timestamp + ".")
    .update(raw)
    .digest();

  const received = Buffer.from(signature, "hex");

  return (
    expected.length === received.length &&
    crypto.timingSafeEqual(expected, received)
  );
}

const EVENT_STATUS = {
  "order.number": "waiting_otp",
  "order.otp": "success",
  "order.refunded": "refunded",
  "order.failed": "failed"
};

function canUpdate(current, incoming) {
  if (!current || current === "processing") return true;

  if (current === "waiting_otp") {
    return [
      "waiting_otp",
      "success",
      "refunded",
      "failed"
    ].includes(incoming);
  }

  if (["success", "refunded", "failed"].includes(current)) {
    return current === incoming;
  }

  return false;
}

async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;

  try {
    const raw = await rawBody(req);

    const valid = verifySignature(
      process.env.NOMERIN_WEBHOOK_SECRET,
      req.headers["x-nomerin-signature"],
      raw
    );

    if (!valid) {
      return send(res, 401, {
        success: false,
        error: { code: "INVALID_SIGNATURE" }
      });
    }

    let payload;

    try {
      payload = JSON.parse(raw.toString("utf8") || "{}");
    } catch {
      return send(res, 400, {
        success: false,
        error: { code: "INVALID_JSON" }
      });
    }

    const event = payload.event;

    if (event === "webhook.test") {
      return send(res, 200, { success: true });
    }

    const incomingStatus = EVENT_STATUS[event];
    const order = payload.order;

    if (
      !incomingStatus ||
      !order ||
      !Number.isSafeInteger(Number(order.id)) ||
      Number(order.id) < 1
    ) {
      return send(res, 400, {
        success: false,
        error: { code: "INVALID_ORDER_EVENT" }
      });
    }

    const orderId = Number(order.id);

    if (order.status && order.status !== incomingStatus) {
      return send(res, 400, {
        success: false,
        error: { code: "INVALID_ORDER_STATUS" }
      });
    }

    const fingerprint = crypto
      .createHash("sha256")
      .update(
        event + "|" +
        orderId + "|" +
        incomingStatus + "|" +
        (order.otp_code || "")
      )
      .digest("hex");

    await db("nomerin_webhook_events?on_conflict=event_fingerprint", {
      method: "POST",
      prefer: "resolution=ignore-duplicates,return=minimal",
      body: [{
        delivery_id: req.headers["x-nomerin-delivery"] || null,
        event_name: event,
        event_fingerprint: fingerprint,
        payload: payload
      }]
    });

    const rows = await db(
      "nomerin_orders?nomerin_order_id=eq." +
      orderId +
      "&select=nomerin_order_id,status,phone_number,otp_code,external_id&limit=1"
    );

    const existing = Array.isArray(rows) ? rows[0] : null;

    if (!existing) {
      return send(res, 500, {
        success: false,
        error: { code: "ORDER_NOT_REGISTERED" }
      });
    }

    if (
      order.external_id &&
      existing.external_id &&
      order.external_id !== existing.external_id
    ) {
      return send(res, 400, {
        success: false,
        error: { code: "ORDER_REFERENCE_MISMATCH" }
      });
    }

    const currentStatus = existing.status || "processing";

    if (!canUpdate(currentStatus, incomingStatus)) {
      return send(res, 200, {
        success: true,
        ignored: true
      });
    }

    const statusFilter = existing.status
      ? "status=eq." + encodeURIComponent(existing.status)
      : "status=is.null";

    await db(
      "nomerin_orders?nomerin_order_id=eq." +
      orderId +
      "&" +
      statusFilter,
      {
        method: "PATCH",
        body: {
          status: incomingStatus,
          phone_number: order.number || existing.phone_number || null,
          otp_code: order.otp_code || existing.otp_code || null,
          provider_payload: order,
          last_event: event
        }
      }
    );

    return send(res, 200, { success: true });

  } catch (error) {
    console.error("Nomerin webhook error:", error.message);

    return send(res, 500, {
      success: false,
      error: {
        code: "WEBHOOK_PROCESSING_FAILED"
      }
    });
  }
}

module.exports = handler;
module.exports.verifySignature = verifySignature;
