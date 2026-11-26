const { method, send } = require("./_lib/http");
const { requireCustomer } = require("./_lib/customer-auth");
const { nomerin } = require("./_lib/nomerin");
const { handleError } = require("./_lib/errors");

module.exports = async function handler(req, res) {
  if (!method(req, res, ["GET"])) return;

  const user = await requireCustomer(req, res);
  if (!user) return;

  try {
    const result = await nomerin("/v1/services");
    return send(res, 200, {
      success: true,
      data: result.data
    });
  } catch (e) {
    return handleError(res, e);
  }
};
