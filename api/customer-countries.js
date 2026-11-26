
const { method, send } = require("./_lib/http");
const { requireCustomer } = require("./_lib/customer-auth");
const { nomerin } = require("./_lib/nomerin");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;

  const user = await requireCustomer(req, res);
  if (!user) return;

  const serviceId = Number(req.query.service_id);

  if (!Number.isInteger(serviceId) || serviceId < 1) {
    return send(res, 400, {
      success: false,
      error: { code: "INVALID_SERVICE_ID" }
    });
  }

  try {
    const result = await nomerin(
      `/v1/countries?service_id=${serviceId}`
    );

    return send(res, 200, {
      success: true,
      data: result.data
    });
  } catch (e) {
    return handleError(res, e);
  }
};
