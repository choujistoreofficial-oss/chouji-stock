const { send } = require("./http");

function handleError(res, error) {
  const status = Number(error.status) || 500;
  return send(res, status, {
    success: false,
    error: {
      code: error.code || "INTERNAL_ERROR",
      message: status >= 500 && !error.code ? "Terjadi kesalahan server." : error.message,
      ...(error.details ? { details: error.details } : {})
    }
  });
}

module.exports = { handleError };
