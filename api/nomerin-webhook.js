
const crypto = require("crypto");
const { send, method } = require("./_lib/http");
const { db } = require("./_lib/supabase");

module.exports.config = { api: { bodyParser: false } };

async function rawBody(req) {
  if (Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === "string") return Buffer.from(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
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

  if (
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    !/^[a-f0-9]{64}$/i.test(signature || "")
  ) return false;

  if (Math.abs(now / 1000 - Number(timestamp)) > 300) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.`)
    .update(raw)
    .digest();

  const received = Buffer.from(signature, "hex");

  return expected.length === received.length &&
    crypto.timingSafeEqual(expected, received);
}

const EVENT_STATUS = {
  "order.number": "waiting_otp",
  "order.otp": "success",
  "order.refunded": "refunded",
  "order.failed": "failed"
};

function canUpdate(current, incoming) {
  const terminal = ["success", "refunded", "failed"];

  if (!current || current === "processing") return true;

  if (current === "waiting_otp") {
    return [
      "waiting_otp",
      "success",
      "refunded",
      "failed"
    ].includes(incoming);
  }

  if (terminal.includes(current)) {
    return current === incoming;
  }

  return false;
}

async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;

  try {
    const raw = await rawBody(req);
    const signature = req.headers["x-nomerin-signature"];

    if (!verifySignature(
      process.env.NOMERIN_WEBHOOK_SECRET,
      signature,
      raw
    )) {
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
    const headerEvent = req.headers["x-nomerin-event"];

    if (
      typeof event !== "string" ||
      (headerEvent && headerEvent !== event)
    ) {
      return send(res, 400, {
        success: false,
        error: { code: "INVALID_EVENT" }
      });
    }

    // Tes webhook tidak membawa order.
    if (event === "webhook.test") {
      return send(res, 200, { success: true });
    }

    const incomingStatus = EVENT_STATUS[event];
    const order = payload.order;

    if (
      !incomingStatus ||
      !order ||
      !Number.isSafeInteger(Number(order.id)) ||
      Number(order.id) < 1 ||
      (order.status && order.status !== incomingStatus)
    ) {
      return send(res, 400, {
        success: false,
        error: { code: "INVALID_ORDER_EVENT" }
      });
    }

    const orderId = Number(order.id);
    const delivery = req.headers["x-nomerin-delivery"] || null;

    const fingerprint = crypto
      .createHash("sha256")
      .update([
        event,
        orderId,
        order.status || incomingStatus,
        order.otp_code || ""
      ].join("|"))
      .digest("hex");

    // Catat event. Pengiriman duplikat tidak membuat catatan baru.
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

    // Cari order yang sudah tersimpan.
    const rows = await db(
      `nomerin_orders?nomerin_order_id=eq.${orderId}&select=nomerin_order_id,status,phone_number,otp_code,external_id,provider_payload&limit=1`
    );

    const existing = Array.isArray(rows) ? rows[0] : null;

    // Order belum tercatat: minta Nomerin mengirim ulang.
    if (!existing) {
      return send(res, 500, {
        success: false,
        error: { code: "ORDER_NOT_REGISTERED" }
      });
    }

    // Pastikan external_id tidak bertentangan.
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

    // Abaikan event yang statusnya sudah kedaluwarsa.
    if (!canUpdate(currentStatus, incomingStatus)) {
      return send(res, 200, { success: true, ignored: true });
    }

    // Untuk OTP berulang, jangan timpa OTP yang lebih baru
    // dengan notifikasi yang waktu penerimaannya lebih lama.
    if (
      incomingStatus === "success" &&
      currentStatus === "success"
    ) {
      const oldTime = existing.provider_payload?.otp_received_at;
      const newTime = order.otp_received_at;

      if (oldTime && newTime) {
        const oldDate = Date.parse(oldTime);
        const newDate = Date.parse(newTime);

        if (
          Number.isFinite(oldDate) &&
          Number.isFinite(newDate) &&
          newDate < oldDate
        ) {
          return send(res, 200, {
            success: true,
            ignored: true
          });
        }
      }
    }

    // Update hanya jika status database belum berubah sejak dibaca.
    const statusFilter = existing.status
      ? `status=eq.${encodeURIComponent(existing.status)}`
      : "status=is.null";

    await db(
      `nomerin_orders?nomerin_order_id=eq.${orderId}&${statusFilter}`,
      {
        method: "PATCH",
        body: {
          status: incomingStatus,
          phone_number: order.number ?? existing.phone_number ?? null,
          otp_code: order.otp_code ?? existing.otp_code ?? null,
          provider_payload: order,
          last_event: event
        }
      }
    );

    return send(res, 200, { success: true });

  } catch (e) {
    console.error("Nomerin webhook error:", e.message);

    return send(res, 500, {
      success: false,
      error: { code: "WEBHOOK_PROCESSING_FAILED" }
    });
  }
}

module.exports = handler;
module.exports.verifySignature = verifySignature;
