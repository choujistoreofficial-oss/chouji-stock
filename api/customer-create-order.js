const crypto = require("crypto");
const { method, send } = require("./_lib/http");
const { requireCustomer } = require("./_lib/customer-auth");
const { nomerin } = require("./_lib/nomerin");
const { db } = require("./_lib/supabase");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["POST"])) return;

  const user = await requireCustomer(req, res);
  if (!user) return;

  try {
    const {
      service_id,
      country_id,
      price,
      request_id
    } = req.body || {};

    const serviceId = Number(service_id);
    const countryId = Number(country_id);
    const selectedPrice = Number(price);

    if (
      !Number.isSafeInteger(serviceId) || serviceId < 1 ||
      !Number.isSafeInteger(countryId) || countryId < 1 ||
      !Number.isSafeInteger(selectedPrice) || selectedPrice < 1 ||
      typeof request_id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request_id)
    ) {
      return send(res, 400, {
        success: false,
        error: { code: "INVALID_BODY" }
      });
    }

    const externalId = "cs-" + crypto
      .createHash("sha256")
      .update(`${user.id}:${request_id}`)
      .digest("hex")
      .slice(0, 48);

    // Periksa apakah request ini pernah membuat order.
    const previousRows = await db(
      `nomerin_orders?external_id=eq.${externalId}&select=user_id,nomerin_order_id,external_id,service_id,country_id,price,status,provider_payload&limit=1`
    );

    const previous = Array.isArray(previousRows)
      ? previousRows[0]
      : null;

    if (previous) {
      if (previous.user_id !== user.id) {
        return send(res, 409, {
          success: false,
          error: { code: "ORDER_OWNER_MISMATCH" }
        });
      }

      if (
        Number(previous.service_id) !== serviceId ||
        Number(previous.country_id) !== countryId ||
        Number(previous.price) !== selectedPrice
      ) {
        return send(res, 409, {
          success: false,
          error: { code: "REQUEST_ID_REUSED" }
        });
      }

      return send(res, 200, {
        success: true,
        data: previous.provider_payload || previous,
        reused: true
      });
    }

    // Validasi harga langsung dari Nomerin.
    const offersResult = await nomerin(
      `/v1/offers?service_id=${serviceId}&country_id=${countryId}`
    );

    const offers = offersResult.data?.offers;

    if (!Array.isArray(offers)) {
      return send(res, 502, {
        success: false,
        error: { code: "INVALID_OFFERS_RESPONSE" }
      });
    }

    const selectedOffer = offers.find(
      offer => Number(offer.price) === selectedPrice
    );

    if (!selectedOffer) {
      return send(res, 409, {
        success: false,
        error: { code: "OFFER_UNAVAILABLE" },
        data: { offers }
      });
    }

    const idem = crypto
      .createHash("sha256")
      .update(externalId)
      .digest("hex")
      .slice(0, 48);

    const result = await nomerin("/v1/orders", {
      method: "POST",
      headers: {
        "Idempotency-Key": idem
      },
      body: {
        service_id: serviceId,
        country_id: countryId,
        price: selectedPrice,
        external_id: externalId
      }
    });

    const order = result.data;

    if (
      !order ||
      !Number.isSafeInteger(Number(order.id)) ||
      Number(order.id) < 1
    ) {
      return send(res, 502, {
        success: false,
        error: { code: "INVALID_ORDER_RESPONSE" }
      });
    }

    // Simpan tanpa menimpa data order yang sudah ada.
    try {
      await db("nomerin_orders?on_conflict=nomerin_order_id", {
        method: "POST",
        prefer: "resolution=ignore-duplicates,return=minimal",
        body: [{
          user_id: user.id,
          nomerin_order_id: Number(order.id),
          external_id: order.external_id || externalId,
          status: order.status,
          service_id: order.service?.id || serviceId,
          service_code: order.service?.code || null,
          service_name: order.service?.name || null,
          country_id: order.country?.id || countryId,
          country_code: order.country?.code || null,
          country_name: order.country?.name || null,
          price: order.price ?? selectedPrice,
          phone_number: order.number || null,
          otp_code: order.otp_code || null,
          provider_payload: order
        }]
      });
    } catch (e) {
      if (e.status !== 409) throw e;
    }

    // Pastikan order benar-benar tersimpan dan pemiliknya cocok.
    const savedRows = await db(
      `nomerin_orders?nomerin_order_id=eq.${Number(order.id)}&select=user_id,external_id,service_id,country_id,price,provider_payload&limit=1`
    );

    const saved = Array.isArray(savedRows)
      ? savedRows[0]
      : null;

    if (!saved) {
      return send(res, 500, {
        success: false,
        error: { code: "ORDER_SAVE_FAILED" }
      });
    }

    if (
      saved.user_id !== user.id ||
      saved.external_id !== externalId
    ) {
      return send(res, 409, {
        success: false,
        error: { code: "ORDER_OWNER_MISMATCH" }
      });
    }

    return send(res, 200, {
      success: true,
      data: saved.provider_payload || order
    });

  } catch (e) {
    return handleError(res, e);
  }
};
