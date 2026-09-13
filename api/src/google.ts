import { createRemoteJWKSet, jwtVerify } from "jose";

const GOOGLE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

const GOOGLE_ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

export type GoogleIdClaims = {
  email: string;
  emailVerified: boolean;
  name: string | null;
  sub: string;
};

/**
 * Verify a Google Identity Services ID token (JWT) for our OAuth client.
 * Requires email + email_verified for account linking by email.
 */
export async function verifyGoogleIdToken(
  idToken: string,
  clientId: string,
): Promise<GoogleIdClaims | { error: string; status: number }> {
  const token = idToken.trim();
  if (!token) return { error: "Missing Google credential", status: 400 };
  if (!clientId.trim()) {
    return { error: "Google Sign-In is not configured", status: 503 };
  }

  try {
    const { payload } = await jwtVerify(token, GOOGLE_JWKS, {
      audience: clientId,
      algorithms: ["RS256"],
    });

    const iss = typeof payload.iss === "string" ? payload.iss : "";
    if (!GOOGLE_ISSUERS.has(iss)) {
      return { error: "Invalid Google credential", status: 401 };
    }

    const email = typeof payload.email === "string" ? payload.email : "";
    const emailVerified = payload.email_verified === true || payload.email_verified === "true";
    const sub = typeof payload.sub === "string" ? payload.sub : "";
    const name = typeof payload.name === "string" ? payload.name : null;

    if (!email || !emailVerified) {
      return { error: "Google account email is not verified", status: 401 };
    }
    if (!sub) {
      return { error: "Invalid Google credential", status: 401 };
    }

    return { email, emailVerified: true, name, sub };
  } catch {
    return { error: "Invalid or expired Google credential", status: 401 };
  }
}
