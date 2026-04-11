// backend/middleware/authMiddleware.js
import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { SUPABASE_URL } from "../config/env.js";

const JWT_SECRET = process.env.SUPABASE_JWT_SECRET;

// ✅ JWKS (for RS256)
const jwksUri = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;

console.log("🔐 [Auth] JWKS URI:", jwksUri);

const client = jwksClient({
  jwksUri,
  cache: true,
  rateLimit: true,
});

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      console.error("[Auth] JWKS key fetch failed:", err.message);
      return callback(err);
    }
    const signingKey = key.getPublicKey();
    callback(null, signingKey);
  });
}

export const protect = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  // 🔍 Decode first to check algorithm
  const decodedHeader = jwt.decode(token, { complete: true });

  if (!decodedHeader) {
    return res.status(401).json({ error: "Invalid token format" });
  }

  const alg = decodedHeader.header.alg;
  console.log("🔍 Token algorithm:", alg);

  // ✅ RS256 (new Supabase tokens)
  if (alg === "RS256" || alg === "ES256") {
    jwt.verify(
      token,
      getKey,
      { algorithms: ["RS256", "ES256"] },
      (err, decoded) => {
        if (err) {
          console.error("[Auth] Public key verification failed:", err.message);
          return res.status(401).json({ error: "Invalid token" });
        }

        console.log(`✅ ${alg} token verified`);

        req.user = {
          id: decoded.sub,
          email: decoded.email,
        };

        next();
      },
    );
  }

  // ✅ HS256 (old tokens)
  else if (alg === "HS256") {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);

      console.log("✅ HS256 token verified");

      req.user = {
        id: decoded.sub,
        email: decoded.email,
      };

      next();
    } catch (err) {
      console.error("[Auth] HS256 verification failed:", err.message);
      return res.status(401).json({ error: "Invalid token" });
    }
  }

  // ❌ Unsupported
  else {
    console.error("[Auth] Unsupported algorithm:", alg);
    return res.status(401).json({ error: "Unsupported token type" });
  }
};
