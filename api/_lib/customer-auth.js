const { send } = require("./http");

async function requireCustomer(req, res) {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    send(res, 401, {
      success: false,
      error: { code: "LOGIN_REQUIRED" }
    });
    return null;
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    send(res, 500, {
      success: false,
      error: { code: "AUTH_CONFIG_MISSING" }
    });
    return null;
  }

  try {
    const response = await fetch(
      `${url.replace(/\/+$/, "")}/auth/v1/user`,
      {
        method: "GET",
        headers: {
          apikey: key,
          Authorization: `Bearer ${token}`
        }
      }
    );

    if (!response.ok) {
      send(res, 401, {
        success: false,
        error: { code: "INVALID_SESSION" }
      });
      return null;
    }

    const user = await response.json();

    if (!user?.id || !user?.email) {
      send(res, 401, {
        success: false,
        error: { code: "INVALID_USER" }
      });
      return null;
    }

    return user;
  } catch (error) {
    send(res, 500, {
      success: false,
      error: { code: "AUTH_CHECK_FAILED" }
    });
    return null;
  }
}

module.exports = { requireCustomer };
