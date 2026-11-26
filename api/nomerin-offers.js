const { method, requireInternal, send } = require("./_lib/http");
const { nomerin } = require("./_lib/nomerin");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"]) || !requireInternal(req, res)) return;
  const serviceId = Number(req.query.service_id);
  const countryId = Number(req.query.country_id);
  if (!Number.isInteger(serviceId) || serviceId < 1 || !Number.isInteger(countryId) || countryId < 1) {
    return send(res, 400, { success: false, error: { code: "INVALID_QUERY" } });
  }
  try { return send(res, 200, await nomerin(`/v1/offers?service_id=${serviceId}&country_id=${countryId}`)); }
  catch (e) { return handleError(res, e); }
};
