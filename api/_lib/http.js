function send(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  return res.end(JSON.stringify(payload));
}

function method(req, res, allowed) {
  if (!allowed.includes(req.method)) {
    res.setHeader("Allow", allowed.join(", "));
    send(res, 405, { success: false, error: { code: "METHOD_NOT_ALLOWED" } });
    return false;
  }
  return true;
}

function requireInternal(req, res) {
  const expected = process.env.CHOUJI_INTERNAL_API_TOKEN;
  const received = req.headers["x-chouji-internal-token"];
  if (!expected || !received || received !== expected) {
    send(res, 401, { success: false, error: { code: "UNAUTHORIZED" } });
    return false;
  }
  return true;
}

module.exports = { send, method, requireInternal };
