const { method, requireInternal, send } = require("./_lib/http");
const { nomerin } = require("./_lib/nomerin");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"]) || !requireInternal(req, res)) return;
  try { return send(res, 200, await nomerin("/v1/balance")); }
  catch (e) { return handleError(res, e); }
};
