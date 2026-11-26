const { method, requireInternal, send } = require("./_lib/http");
const { nomerin } = require("./_lib/nomerin");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"]) || !requireInternal(req, res)) return;
  const serviceId = Number(req.query.service_id);
  if (!Number.isInteger(serviceId) || serviceId < 1) {
    return send(res, 400, { success: false, error: { code: "INVALID_SERVICE_ID" } });
  }
  try { return send(res, 200, await nomerin(`/v1/countries?service_id=${serviceId}`)); }
  catch (e) { return handleError(res, e); }
};
