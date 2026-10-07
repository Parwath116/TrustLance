const jwt = require("jsonwebtoken");
const config = require("../config");

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication token required in Authorization header" });
  }

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret);
    if (!decoded || !decoded.address) {
      return res.status(401).json({ error: "Invalid token payload" });
    }
    req.user = {
      address: decoded.address.toLowerCase(),
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token", details: err.message });
  }
}

module.exports = { requireAuth };
