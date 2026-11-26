
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

    // Periksa harga langsung dari Nomerin
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

    // ID unik dan konsisten untuk percobaan ulang order
    const externalId = "cs-" + crypto
      .createHash("sha256")
      .update(`${user.id}:${request_id}`)
      .digest("hex")
      .slice(0, 48);

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

    if (!order || !Number.isInteger(Number(order.id))) {
      return send(res, 502, {
        success: false,
        error: { code: "INVALID_ORDER_RESPONSE" }
      });
    }

    // Simpan order beserta pemilik akun
    await db("nomerin_orders?on_conflict=nomerin_order_id", {
      method: "POST",
      prefer: "resolution=merge-duplicates,return=minimal",
      body: [{
        user_id: user.id,
        nomerin_order_id: order.id,
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

    return send(res, 200, {
      success: true,
      data: order
    });

  } catch (e) {
    return handleError(res, e);
  }
};

